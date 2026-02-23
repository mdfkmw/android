// backend/sockets/agentSocket.js
const db = require('../db');


function attachAgentSocket(io) {
  const nsp = io.of('/agent');

  // Auth middleware pentru agent (enterprise minimal)
  nsp.use(async (socket, next) => {

    try {


      const terminalKey = String(socket.handshake.auth?.agent_key || '');

      const res = await db.query(
        'SELECT id FROM terminals WHERE terminal_key = ? AND active = 1 LIMIT 1',
        [terminalKey]
      );

      const rows = Array.isArray(res)
        ? (Array.isArray(res[0]) ? res[0] : res)
        : res?.rows;

      const terminal = rows?.[0];

      if (!terminal) {
        return next(new Error('unknown_terminal'));
      }

      socket.data.terminal_id = terminal.id;





      return next();
    } catch (e) {
      return next(new Error('agent_auth_error'));
    }
  });

  nsp.on('connection', (socket) => {
    console.log('[socket.io][agent] connected', socket.id);


const terminalId = socket.data.terminal_id;
socket.join(`terminal:${terminalId}`);



  socket.on('agent:requestJob', async () => {

    console.log("[DBG][agentSocket] requestJob terminalId=", terminalId);


  try {
    const terminalId = socket.data.terminal_id;

    // 1) luăm doar ID-ul celui mai vechi job queued pentru acest terminal
    const pickRes = await db.query(
      `SELECT id
       FROM agent_jobs
       WHERE status = 'queued'
         AND target_terminal_id = ?
       ORDER BY id ASC
       LIMIT 1`,
      [terminalId]
    );

    const pickRows = Array.isArray(pickRes)
      ? (Array.isArray(pickRes[0]) ? pickRes[0] : pickRes)
      : pickRes?.rows;

    const pickedId = Number(pickRows?.[0]?.id || 0);

    if (!pickedId) {
      socket.emit('job:none', { ok: true });
      return;
    }
console.log("[DBG][agentSocket] pickedId=", pickedId);

    // 2) LOCK atomic: queued -> in_progress (dacă a fost luat deja, affectedRows = 0)
const lockRes = await db.query(
  `UPDATE agent_jobs
   SET status = 'in_progress'
   WHERE id = ?
     AND status = 'queued'
     AND target_terminal_id = ?
   LIMIT 1`,
  [pickedId, terminalId]
);

const affectedRows = Number(lockRes?.rowCount ?? lockRes?.raw?.affectedRows ?? 0);



    if (affectedRows !== 1) {
      // alt request/reconnect l-a luat deja; nu emitem nimic ca să evităm duplicate
      socket.emit('job:none', { ok: true });
      return;
    }

    // 3) acum citim jobul blocat și îl trimitem
    const jobRes = await db.query(
      `SELECT id, job_type, payload
       FROM agent_jobs
       WHERE id = ?
         AND target_terminal_id = ?
       LIMIT 1`,
      [pickedId, terminalId]
    );

    const jobRows = Array.isArray(jobRes)
      ? (Array.isArray(jobRes[0]) ? jobRes[0] : jobRes)
      : jobRes?.rows;

    const job = jobRows?.[0] || null;

    if (!job) {
      socket.emit('job:none', { ok: true });
      return;
    }

    let payloadObj = null;
    try {
      payloadObj = job.payload ? JSON.parse(job.payload) : null;
    } catch {
      payloadObj = null;
    }

    socket.emit('job:new', {
      ok: true,
      job: {
        id: job.id,
        job_type: job.job_type,
        payload: payloadObj,
      },
    });
  } catch (e) {
    console.error('[socket.io][agent] requestJob error', e);
    socket.emit('job:error', { ok: false, error: 'request_job_failed' });
  }
});



    socket.on('disconnect', (reason) => {
      console.log('[socket.io][agent] disconnected', socket.id, reason);
    });
  });
}

module.exports = { attachAgentSocket };
