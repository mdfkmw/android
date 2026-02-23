const jwt = require('jsonwebtoken');

const COOKIE_NAME = process.env.PUBLIC_INTENT_COOKIE || 'public_intent_id';

const RAW_COOKIE_MAX_AGE_DAYS = Number(process.env.PUBLIC_INTENT_COOKIE_MAX_AGE_DAYS || 7);
const COOKIE_MAX_AGE_DAYS = Number.isFinite(RAW_COOKIE_MAX_AGE_DAYS) && RAW_COOKIE_MAX_AGE_DAYS > 0
  ? RAW_COOKIE_MAX_AGE_DAYS
  : 7;

const COOKIE_MAX_AGE_MS = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

// ID anonim = număr negativ (ca în varianta ta veche)
function generatePublicOwnerId() {
  const min = 1_000_000_000;
  const max = 2_147_483_647; // signed 32-bit max
  const value = Math.floor(Math.random() * (max - min + 1)) + min;
  return -value;
}

/**
 * Returnează ownerId pentru intents:
 * - dacă user e logat (req.user.id) => ownerId = user.id
 * - altfel => ownerId din cookie JWT semnat; dacă nu există sau e invalid, creează unul nou
 */
function ensureIntentOwner(req, res) {
  // 1) user logat (public sau intern)
  if (req?.user && Number.isInteger(Number(req.user.id))) {
    return {
      ownerId: Number(req.user.id),
      source: 'jwt',
      isNew: false,
    };
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET missing (needed for public intent JWT)');
  }

  const token = req?.cookies?.[COOKIE_NAME];

  // 2) dacă există cookie, încercăm să-l verificăm
  if (token) {
    try {
      const payload = jwt.verify(token, secret);
      const ownerId = Number(payload?.ownerId);

      // acceptăm doar numere întregi NEGATIVE (anon)
      if (Number.isInteger(ownerId) && ownerId < 0) {
        return {
          ownerId,
          source: 'public_jwt_cookie',
          isNew: false,
        };
      }
    } catch (e) {
      // invalid/expirat -> regenerăm mai jos
    }
  }

  // 3) generăm ownerId nou (negativ) și setăm cookie JWT
  const ownerId = generatePublicOwnerId();

  const newToken = jwt.sign(
    { ownerId, type: 'public_intent' },
    secret,
    { expiresIn: `${COOKIE_MAX_AGE_DAYS}d` }
  );

  // IMPORTANT pentru subdomenii + https
  // IMPORTANT: cookie-ul trebuie să meargă și pe localhost (http) și pe producție (https + subdomenii)
  const forwardedProto = (req.headers['x-forwarded-proto'] || '').toString().toLowerCase();
  const isHttps = req.secure || forwardedProto === 'https';

  const cookieOptions = {
    httpOnly: true,
    secure: isHttps,                 // pe http dev => false, pe https prod => true
    sameSite: isHttps ? 'none' : 'lax',
    maxAge: COOKIE_MAX_AGE_MS,
    path: '/',
  };

  // domain doar în producție/subdomenii (altfel strică pe localhost)
  const domain = process.env.PUBLIC_INTENT_COOKIE_DOMAIN;
  if (domain && isHttps) {
    cookieOptions.domain = domain;   // ex: .pris-com.ro
  }

  res.cookie(COOKIE_NAME, newToken, cookieOptions);


  return {
    ownerId,
    source: 'public_jwt_cookie',
    isNew: true,
  };
}

module.exports = {
  ensureIntentOwner,
  COOKIE_NAME,
};
