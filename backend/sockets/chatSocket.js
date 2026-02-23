// backend/sockets/chatSocket.js
const jwt = require('jsonwebtoken');
const db = require('../db');
const { ACCESS_COOKIE } = require('../middleware/auth');

const CAN_CHAT_ROLES = new Set(['admin', 'operator_admin', 'agent']);
const ROOM = 'agent_chat';

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

function attachChatSocket(io) {
  const nsp = io.of('/chat');

  // Auth middleware (handshake)
  nsp.use((socket, next) => {
    try {
      const cookieHeader = socket.request.headers.cookie || '';
      const cookies = parseCookies(cookieHeader);
      const token = cookies[ACCESS_COOKIE];

      if (!token) return next(new Error('NO_TOKEN'));

      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (!payload?.role || !CAN_CHAT_ROLES.has(payload.role)) {
        return next(new Error('FORBIDDEN'));
      }

      socket.user = payload;
      return next();
    } catch (err) {
      return next(new Error('BAD_TOKEN'));
    }
  });

  nsp.on('connection', (socket) => {
    //console.log('[chat socket] CONNECTED namespace:', socket.nsp.name);
    // intră în camera globală
    socket.join(ROOM);

    socket.emit('chat:ready', { ok: true });

   socket.on('chat:watch', () => {
  socket.join(ROOM);
});

socket.on('chat:unwatch', () => {
  socket.leave(ROOM);
});

    

  });
}

module.exports = { attachChatSocket };
