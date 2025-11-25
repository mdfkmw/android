const express = require('express');
const db = require('../db');

const router = express.Router();

const listeners = new Set();
let lastCall = null;
let sequence = 0;
let secretWarningLogged = false;
const MAX_HISTORY = 500;
const callHistory = [];
let historyLoaded = false;

const STATUS_LABELS = new Set(['ringing', 'answered', 'missed', 'rejected']);

function normalizeStatus(rawStatus) {
  if (!rawStatus) return 'ringing';
  const status = String(rawStatus).trim().toLowerCase();
  if (STATUS_LABELS.has(status)) return status;
  if (status === 'no_answer' || status === 'noanswer') return 'missed';
  return 'ringing';
}

function sanitizePhone(rawValue) {
  if (rawValue == null) {
    return { display: '', digits: '' };
  }
  const str = String(rawValue).trim();
  if (!str) {
    return { display: '', digits: '' };
  }

  let digits = str.replace(/\D/g, '');
  const startsWithPlus = str.startsWith('+');

  if (!digits) {
    return { display: '', digits: '' };
  }

  if (digits.length > 20) {
    digits = digits.slice(0, 20);
  }

  const display = startsWithPlus ? `+${digits}` : digits;
  return { display, digits };
}

async function countNoShows(personId) {
  if (!personId) return 0;
  try {
    const res = await db.query('SELECT COUNT(*) AS cnt FROM no_shows WHERE person_id = ?', [personId]);
    return Number(res.rows?.[0]?.cnt || 0);
  } catch (err) {
    console.error('[incoming-calls] Nu am putut citi neprezentările:', err);
    return 0;
  }
}

async function getLastSegment(personId) {
  if (!personId) return null;
  try {
    const res = await db.query(
      `SELECT
         bs.name AS board_name,
         es.name AS exit_name
       FROM reservations r
       LEFT JOIN stations bs ON bs.id = r.board_station_id
       LEFT JOIN stations es ON es.id = r.exit_station_id
       WHERE r.person_id = ?
       ORDER BY r.id DESC
       LIMIT 1`,
      [personId],
    );
    const row = res.rows?.[0];
    if (!row) return null;
    if (!row.board_name || !row.exit_name) return null;
    return { board: row.board_name, exit: row.exit_name };
  } catch (err) {
    console.error('[incoming-calls] Nu am putut citi ultimul segment rezervat:', err);
    return null;
  }
}

async function enrichCall(call) {
  if (!call) return call;
  const digits = (call.digits || call.phone || '').replace(/\D/g, '');
  let callerName = call.meta?.callerName || call.caller_name || null;
  let personId = call.meta?.personId ?? call.person_id ?? null;

  try {
    if (!personId && digits) {
      const personRes = await db.query('SELECT id, name FROM people WHERE phone = ? LIMIT 1', [digits]);
      if (personRes.rows?.length) {
        personId = personRes.rows[0].id;
        callerName = callerName || personRes.rows[0].name || null;
      }
    }

    if (personId && !callerName) {
      const personRes = await db.query('SELECT name FROM people WHERE id = ? LIMIT 1', [personId]);
      callerName = personRes.rows?.[0]?.name || callerName || null;
    }

    const [noShowCount, lastSegment] = await Promise.all([
      countNoShows(personId),
      getLastSegment(personId),
    ]);

    return {
      ...call,
      meta: {
        ...(call.meta || {}),
        callerName,
        personId,
        lastSegment,
        noShowCount,
      },
    };
  } catch (err) {
    console.error('[incoming-calls] Eroare la îmbogățirea apelului:', err);
    return call;
  }
}

function broadcast(event) {
  const payload = `id: ${event.id}\nevent: call\ndata: ${JSON.stringify(event)}\n\n`;
  for (const listener of Array.from(listeners)) {
    try {
      listener.res.write(payload);
    } catch (err) {
      cleanupListener(listener);
    }
  }
}

function cleanupListener(listener) {
  if (!listener) return;
  if (listener.heartbeat) {
    clearInterval(listener.heartbeat);
  }
  listeners.delete(listener);
}

function storeInHistory(entry) {
  const existingIdx = callHistory.findIndex((item) => item.id === entry.id);
  if (existingIdx !== -1) {
    callHistory.splice(existingIdx, 1);
  }
  callHistory.unshift(entry);
  if (callHistory.length > MAX_HISTORY) {
    callHistory.pop();
  }
}

async function ensureHistoryLoaded() {
  if (historyLoaded) return;
  historyLoaded = true;
  try {
    const { rows } = await db.query(
      `SELECT id, phone, digits, extension, source, status, note, caller_name, person_id, received_at
         FROM incoming_calls
        ORDER BY id DESC
        LIMIT ?`,
      [MAX_HISTORY],
    );

    callHistory.length = 0;

    for (const row of rows || []) {
      const normalized = {
        id: String(row.id),
        phone: row.phone,
        digits: row.digits,
        received_at: row.received_at ? new Date(row.received_at).toISOString() : null,
        extension: row.extension,
        source: row.source,
        status: normalizeStatus(row.status),
        note: row.note,
        meta: {
          callerName: row.caller_name || null,
          personId: row.person_id ?? null,
        },
      };

      const enriched = await enrichCall(normalized);
      storeInHistory(enriched);
      const numericId = Number(row.id);
      if (Number.isFinite(numericId)) {
        sequence = Math.max(sequence, numericId);
      }
    }

    if (callHistory.length) {
      lastCall = callHistory[0];
    }
  } catch (err) {
    historyLoaded = false;
    console.error('[incoming-calls] Nu am putut încărca istoricul din DB:', err);
  }
}

router.post('/', async (req, res) => {
  const expectedSecret = process.env.PBX_WEBHOOK_SECRET;
  const providedSecret = req.get('x-pbx-secret') || req.body?.secret || req.query?.secret;

  if (expectedSecret) {
    if (!providedSecret || providedSecret !== expectedSecret) {
      return res.status(401).json({ error: 'invalid secret' });
    }
  } else if (!secretWarningLogged) {
    console.warn('[incoming-calls] Atenție: PBX_WEBHOOK_SECRET nu este setat. Webhook-urile sunt acceptate fără autentificare.');
    secretWarningLogged = true;
  }

  const { display, digits } = sanitizePhone(req.body?.phone ?? req.body?.caller ?? req.body?.number ?? '');

  if (!display && !digits) {
    return res.status(400).json({ error: 'phone missing' });
  }

  const extension = req.body?.extension != null ? String(req.body.extension).trim() : null;
  const source = req.body?.source != null ? String(req.body.source).trim() : null;

  const receivedAt = new Date();
  const status = normalizeStatus(req.body?.status);
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : null;
  const callerName = typeof req.body?.name === 'string' ? req.body.name.trim() || null : null;
  const personId = req.body?.person_id ?? null;

  let insertedId = null;
  try {
    const insertRes = await db.query(
      `INSERT INTO incoming_calls
        (phone, digits, extension, source, status, note, caller_name, person_id, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        display || digits,
        digits || null,
        extension || null,
        source || null,
        status,
        note || null,
        callerName,
        personId,
        receivedAt,
      ],
    );
    insertedId = insertRes.insertId;
    const numericId = Number(insertedId);
    if (Number.isFinite(numericId)) {
      sequence = Math.max(sequence, numericId);
    }
  } catch (err) {
    console.error('[incoming-calls] Nu am putut salva în DB:', err);
  }

  const eventId = insertedId != null ? insertedId : ++sequence;
  const entry = {
    id: String(eventId),
    phone: display || digits,
    digits,
    extension: extension || null,
    source: source || null,
    received_at: receivedAt.toISOString(),
    status,
    note: note || null,
    meta: {
      callerName,
      personId,
    },
  };

  const enriched = await enrichCall(entry);

  storeInHistory(enriched);
  lastCall = enriched;
  broadcast(enriched);

  return res.json({ success: true });
});

router.get('/stream', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'auth required' });
  }

  await ensureHistoryLoaded();

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  res.write('retry: 4000\n\n');

  const listener = { res };
  listener.heartbeat = setInterval(() => {
    try {
      res.write(': keep-alive\n\n');
    } catch (err) {
      cleanupListener(listener);
    }
  }, 25000);

  req.on('close', () => cleanupListener(listener));
  req.on('end', () => cleanupListener(listener));
  res.on('close', () => cleanupListener(listener));
  res.on('finish', () => cleanupListener(listener));

  listeners.add(listener);

  if (lastCall) {
    res.write(`id: ${lastCall.id}\nevent: call\ndata: ${JSON.stringify(lastCall)}\n\n`);
  }
});

router.get('/last', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'auth required' });
  }
  await ensureHistoryLoaded();
  const enriched = await enrichCall(lastCall);
  if (enriched) {
    lastCall = enriched;
  }
  res.json({ call: lastCall });
});

router.get('/log', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'auth required' });
  }

  await ensureHistoryLoaded();

  const limit = Math.max(1, Math.min(Number.parseInt(req.query?.limit, 10) || 100, MAX_HISTORY));

  const { rows } = await db.query(
    `SELECT
        ic.id,
        ic.phone,
        ic.digits,
        ic.received_at,
        ic.extension,
        ic.source,
        ic.status,
        ic.note,
        ic.caller_name,
        ic.person_id,
        p.id AS matched_person_id,
        p.name AS matched_person_name
      FROM incoming_calls ic
      LEFT JOIN people p ON ic.digits IS NOT NULL AND p.phone = ic.digits
      ORDER BY ic.id DESC
      LIMIT ?`,
    [limit],
  );

  const entries = (rows || []).map((row) => ({
    id: String(row.id),
    phone: row.phone || row.digits || '',
    digits: row.digits,
    received_at: row.received_at ? new Date(row.received_at).toISOString() : null,
    extension: row.extension,
    source: row.source,
    status: normalizeStatus(row.status),
    note: row.note,
    caller_name: row.caller_name || row.matched_person_name || null,
    person_id: row.person_id || row.matched_person_id || null,
  }));

  res.json({ entries });
});

module.exports = router;
