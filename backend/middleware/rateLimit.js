// backend/middleware/rateLimit.js
function toInt(v, fallback) {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function isEnabled() {
  const v = String(process.env.RATE_LIMIT_ENABLED ?? '1').trim().toLowerCase();
  return !(v === '0' || v === 'false' || v === 'off' || v === 'no');
}

// In-memory store: key -> { count, resetAt }
const store = new Map();

// curățare periodică (ca să nu crească la infinit)
setInterval(() => {
  const now = Date.now();
  for (const [k, entry] of store.entries()) {
    if (!entry || entry.resetAt <= now) store.delete(k);
  }
}, 60_000).unref?.();

function makeRateLimiter({ name, windowMs, max, keyFn }) {
  const _windowMs = toInt(windowMs, 60_000);
  const _max = toInt(max, 20);

  return function rateLimit(req, res, next) {
    if (!isEnabled()) return next();

    const now = Date.now();
    const key = `${name}:${keyFn ? keyFn(req) : (req.ip || 'unknown')}`;

    let entry = store.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + _windowMs };
      store.set(key, entry);
    }

    entry.count += 1;

    const remaining = Math.max(0, _max - entry.count);
    const retryAfterSec = Math.max(0, Math.ceil((entry.resetAt - now) / 1000));

    // headers utile (nu obligatorii)
    res.setHeader('X-RateLimit-Limit', String(_max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.floor(entry.resetAt / 1000)));

    if (entry.count > _max) {
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: 'Prea multe încercări eșuate. Încearcă din nou mai târziu.',
        message: 'Prea multe încercări eșuate. Încearcă din nou mai târziu.',
        retry_after_seconds: retryAfterSec,
      });
    }

    next();
  };
}

module.exports = {
  makeRateLimiter,
  toInt,
};
