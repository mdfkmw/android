// backend/middleware/csrf.js
const crypto = require('crypto');

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// setează cookie-ul csrf_token dacă lipsește
function csrfCookie(req, res, next) {
  if (!req.cookies?.csrf_token) {
    const token = generateToken();
const isProd = process.env.NODE_ENV === 'production';

res.cookie('csrf_token', token, {
  httpOnly: false,
  secure: isProd,
  sameSite: 'strict',
  path: '/',
  // IMPORTANT: permite citirea din diagrama.pris-com.ro
  ...(isProd ? { domain: '.pris-com.ro' } : {}),
});

  }
  next();
}

// blochează doar cererile "de scriere" către /api (dar NU public/mobile/auth login/refresh)
function csrfProtect(req, res, next) {
  const m = (req.method || '').toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(m)) return next();

  const p = req.path || '';
  // protejăm doar /api/*
  if (!p.startsWith('/api/')) return next();


    // ✅ EXCEPȚIE pentru agent (machine-to-machine, autentificat cu AGENT_KEY)
  if (p === '/api/agent/poll') return next();
  
    // ✅ EXCEPȚIE aplicație mobilă Android (JWT Bearer, CSRF irelevant)
  if (p.startsWith('/api/mobile/')) return next();   // ← ADAUGĂ ASTA

  // ✅ EXCEPȚIE pentru agent (machine-to-machine, autentificat cu AGENT_KEY)
if (p.startsWith('/api/agent/')) return next();


  // Dacă requestul vine din frontend-ul intern (diagrama), permitem scrierile fără X-CSRF-Token,
  // deoarece browserul va seta Origin corect (nu poate fi falsificat de un site terț).
  const origin = String(req.headers.origin || '');
  const allowed = String(process.env.CSRF_ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (origin && allowed.includes(origin)) {
    return next();
  }

  // fallback: verificare double-submit (cookie == header) pentru clienți care trimit X-CSRF-Token
  const cookieToken = req.cookies?.csrf_token;
  const headerToken = req.headers['x-csrf-token'];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: 'csrf_invalid' });
  }

  return next();



}

module.exports = { csrfCookie, csrfProtect };
