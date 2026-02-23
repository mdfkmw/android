const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db');
const {
  signAccessToken, signRefreshToken, setAuthCookies, clearAuthCookies,
  requireAuth
} = require('../middleware/auth');

// helper DB
async function q(sql, params) {
  const r = await db.query(sql, params);
  return r.rows || r[0] || r;
}
function hash(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

// =====================================================
// SAFE AUTH LOGGING (DEV detaliat, PROD fără date personale)
// =====================================================
const IS_PROD = process.env.NODE_ENV === 'production';

function logAuth(message, meta) {
  // În DEV: log complet (te ajută la debug)
  if (!IS_PROD) {
    if (meta !== undefined) return console.log(`[AUTH] ${message}`, meta);
    return console.log(`[AUTH] ${message}`);
  }

  // În PROD: NU logăm ident/email/telefon/username etc.
  // Păstrăm doar info tehnic minim (id/role/status/reason).
  const safe = {};
  if (meta && typeof meta === 'object') {
    if (meta.id !== undefined) safe.id = meta.id;
    if (meta.role !== undefined) safe.role = meta.role;
    if (meta.status !== undefined) safe.status = meta.status;
    if (meta.reason !== undefined) safe.reason = meta.reason;
  }

  if (Object.keys(safe).length) return console.log(`[AUTH] ${message}`, safe);
  return console.log(`[AUTH] ${message}`);
}



const { makeRateLimiter } = require('../middleware/rateLimit');
const loginLimiter = makeRateLimiter({
  name: 'auth_login',
  windowMs: process.env.RATE_LIMIT_LOGIN_WINDOW_MS,
  max: process.env.RATE_LIMIT_LOGIN_MAX,
});
const refreshLimiter = makeRateLimiter({
  name: 'auth_refresh',
  windowMs: process.env.RATE_LIMIT_REFRESH_WINDOW_MS,
  max: process.env.RATE_LIMIT_REFRESH_MAX,
});




// POST /api/auth/login  { email | phone | username | id | identifier, password }
router.post('/login', loginLimiter, async (req, res) => {
  const {
    email,
    phone,
    username,
    id,
    identifier,
    password,
    terminal_id
  } = req.body || {};

  const raw = (email ?? phone ?? username ?? id ?? identifier);
  if (!raw || !password) {
    logAuth('400 lipsă ident/parolă', { status: 400, reason: 'missing_fields', raw: !!raw, hasPassword: !!password });
    return res.status(400).json({ error: 'email/telefon sau username + parolă necesare' });
  }
  const ident = String(raw).trim();
  logAuth('login attempt', { reason: 'attempt' });


  // Caută atât pe email cât și pe telefon (ident introdus într-un singur câmp)
  const rows = await q(
    `SELECT id, name, email, phone, username, role, operator_id,
       default_terminal_id,
       active, password_hash
FROM employees

      WHERE (id = ? OR email = ? OR phone = ? OR username = ?)
      LIMIT 1`,
    [ident, ident, ident, ident]
  );
  const emp = rows && rows[0] ? rows[0] : null;
  if (!emp) {
    logAuth('401 user negăsit', { status: 401, reason: 'not_found' });

    return res.status(401).json({ error: 'cont invalid sau inactiv' });
  }
  if (!emp.active) {
    logAuth('401 user inactiv', { status: 401, id: emp.id, reason: 'inactive' });

    return res.status(401).json({ error: 'cont invalid sau inactiv' });
  }



  let ok = false;
  try {
    if (emp.password_hash && password) {
      ok = await bcrypt.compare(String(password), String(emp.password_hash));
    }
  } catch (err) {
    console.error('[AUTH] eroare bcrypt.compare', err);
    ok = false;
  }
  if (!ok) {
    logAuth('401 parolă greșită', { status: 401, id: emp.id, reason: 'bad_password' });

    return res.status(401).json({ error: 'credențiale invalide' });
  }

  let workingTerminalId = null;

  // 1) dacă frontend a trimis explicit terminal_id
  if (terminal_id) {
    workingTerminalId = Number(terminal_id);
  } else {
    // 2) fallback: terminalul default al userului
    workingTerminalId = emp.default_terminal_id;
  }

  if (!workingTerminalId) {
    logAuth('login fără terminal', { status: 409, id: emp.id, reason: 'no_terminal' });
    return res.status(409).json({
      error: 'Nu este setat un terminal pentru acest utilizator'
    });
  }

  const termRows = await q(
    'SELECT id FROM terminals WHERE id = ? AND active = 1 LIMIT 1',
    [workingTerminalId]
  );

  if (!termRows || !termRows[0]) {
    logAuth('login terminal invalid', {
      status: 403,
      id: emp.id,
      reason: 'invalid_terminal'
    });
    return res.status(403).json({
      error: 'Terminal invalid sau inactiv'
    });
  }

  const payload = {
    id: emp.id,
    role: emp.role,
    operator_id: emp.operator_id,
    terminal_id: workingTerminalId,   // 👈 CHEIA
    name: emp.name,
    email: emp.email,
    username: emp.username,
  };

  const access = signAccessToken(payload);
  const refresh = signRefreshToken({ sid: crypto.randomUUID(), ...payload });

  await q(
    `INSERT INTO sessions (employee_id, token_hash, user_agent, ip, expires_at)
     VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))`,
    [emp.id, hash(refresh), req.headers['user-agent'] || null, req.ip || null]
  );

  setAuthCookies(res, access, refresh);
  logAuth('200 login OK', { status: 200, id: emp.id, role: emp.role, reason: 'ok' });

  return res.json({ ok: true, user: payload, token: access });
});

// POST /api/auth/refresh
router.post('/refresh', refreshLimiter, async (req, res) => {
  const refresh = req.cookies?.refresh_token;
  if (!refresh) return res.status(401).json({ error: 'no refresh' });

  // validăm semnătura JWT
  let payload;
  try {
    payload = require('jsonwebtoken').verify(refresh, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'refresh invalid' });
  }

  // verificăm în DB existența token-ului
  const rows = await q('SELECT id, employee_id, revoked_at, expires_at FROM sessions WHERE token_hash=? LIMIT 1', [hash(refresh)]);
  const sess = rows[0];
  if (!sess || sess.revoked_at) return res.status(401).json({ error: 'refresh revocat' });

  // rotim refresh-ul (nou hash, marcăm rotated_from)
  await q('UPDATE sessions SET revoked_at=NOW() WHERE id=?', [sess.id]);

  const empRows = await q('SELECT id, name, email, username, role, operator_id, active FROM employees WHERE id=? LIMIT 1', [sess.employee_id]);
  const emp = empRows[0];
  if (!emp) {
    logAuth('refresh: employee negăsit', { status: 401, id: sess.employee_id, reason: 'not_found' });

    return res.status(401).json({ error: 'cont invalid sau inactiv' });
  }
  if (!emp.active) {
    logAuth('refresh: employee inactiv', { status: 401, id: emp.id, reason: 'inactive' });


    return res.status(401).json({ error: 'cont invalid sau inactiv' });
  }

  const newPayload = {
    id: emp.id,
    role: emp.role,
    operator_id: emp.operator_id,
    terminal_id: payload.terminal_id, // ✅ păstrăm terminalul ales la login
    name: emp.name,
    email: emp.email,
    username: emp.username,
  };

  const access = signAccessToken(newPayload);
  const newRefresh = signRefreshToken({ sid: crypto.randomUUID(), ...newPayload });
  await q(
    `INSERT INTO sessions (employee_id, token_hash, user_agent, ip, expires_at, rotated_from)
     VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY), ?)`,
    [emp.id, hash(newRefresh), req.headers['user-agent'] || null, req.ip || null, hash(refresh)]
  );
  setAuthCookies(res, access, newRefresh);
  res.json({ ok: true });
});


// POST /api/auth/set-terminal  { terminal_id }
router.post('/set-terminal', requireAuth, async (req, res) => {
  try {
    const terminal_id = Number(req.body?.terminal_id);
    if (!terminal_id) {
      return res.status(400).json({ error: 'terminal_id lipsă' });
    }

    const termRows = await q(
      'SELECT id FROM terminals WHERE id = ? AND active = 1 LIMIT 1',
      [terminal_id]
    );
    if (!termRows || !termRows[0]) {
      return res.status(403).json({ error: 'Terminal invalid sau inactiv' });
    }

    // luăm employee curent (sigur)
    const empRows = await q(
      'SELECT id, name, email, username, role, operator_id, active FROM employees WHERE id=? LIMIT 1',
      [req.user.id]
    );
    const emp = empRows[0];
    if (!emp || !emp.active) {
      return res.status(401).json({ error: 'cont invalid sau inactiv' });
    }

    const newPayload = {
      id: emp.id,
      role: emp.role,
      operator_id: emp.operator_id,
      terminal_id: terminal_id,
      name: emp.name,
      email: emp.email,
      username: emp.username,
    };

    const access = signAccessToken(newPayload);
    const refresh = signRefreshToken({ sid: crypto.randomUUID(), ...newPayload });

    await q(
      `INSERT INTO sessions (employee_id, token_hash, user_agent, ip, expires_at)
       VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))`,
      [emp.id, hash(refresh), req.headers['user-agent'] || null, req.ip || null]
    );

    setAuthCookies(res, access, refresh);
    return res.json({ ok: true, user: newPayload });
  } catch (err) {
    console.error('[POST /api/auth/set-terminal]', err);
    return res.status(500).json({ error: 'Eroare la setare terminal' });
  }
});



// POST /api/auth/logout
router.post('/logout', requireAuth, async (req, res) => {
  const refresh = req.cookies?.refresh_token;
  if (refresh) {
    await q('UPDATE sessions SET revoked_at=NOW() WHERE token_hash=?', [hash(refresh)]);
  }
  clearAuthCookies(res);
  res.json({ ok: true });
});


// GET /api/auth/me — întoarce utilizatorul curent sau null (NU cere autentificare)
router.get('/me', (req, res) => {
  // req.user e setat de verifyAccessToken (dacă există cookie valid)
  res.status(200).json({ user: req.user || null });
});



module.exports = router;
