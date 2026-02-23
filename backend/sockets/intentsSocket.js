// backend/sockets/intentsSocket.js
const jwt = require('jsonwebtoken');
const { setIntentsNamespace } = require('./emitters');

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  cookieHeader.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  });
  return out;
}

function attachIntentsSocket(io) {
  const nsp = io.of('/intents');
setIntentsNamespace(nsp);

  // JWT e OPTIONAL aici (public poate fi anonim)
  nsp.use((socket, next) => {
    try {
      const cookies = parseCookies(socket.request.headers.cookie || '');

      // dacă ai cookie access_token, încercăm să-l validăm (dacă e invalid, ignorăm)
      const token = cookies['access_token'];
      if (token) {
        try {
          const payload = jwt.verify(token, process.env.JWT_SECRET);
          socket.user = payload; // user logat (public sau intern)
        } catch (_) {
          socket.user = null;
        }
      } else {
        socket.user = null;
      }

      return next();
    } catch (e) {
      // nu blocăm connect-ul pentru intents
      socket.user = null;
      return next();
    }
  });

  nsp.on('connection', (socket) => {
    console.log('[intents] connected', socket.id, 'user:', socket.user?.id || 'anon');

    socket.on('intents:watch', ({ tripId } = {}, ack) => {
      const t = Number(tripId);
      if (!Number.isInteger(t) || t <= 0) {
        if (typeof ack === 'function') ack({ ok: false, error: 'BAD_TRIP_ID' });
        return;
      }

      const room = `trip:${t}`;
      socket.join(room);

      console.log('[intents] watch', { socket: socket.id, room });

      if (typeof ack === 'function') ack({ ok: true, room });
    });

    socket.on('intents:unwatch', ({ tripId } = {}, ack) => {
      const t = Number(tripId);
      if (!Number.isInteger(t) || t <= 0) {
        if (typeof ack === 'function') ack({ ok: false, error: 'BAD_TRIP_ID' });
        return;
      }

      const room = `trip:${t}`;
      socket.leave(room);

      console.log('[intents] unwatch', { socket: socket.id, room });

      if (typeof ack === 'function') ack({ ok: true, room });
    });
  });

  return nsp;
}

module.exports = { attachIntentsSocket };
