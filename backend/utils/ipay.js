// utils/ipay.js
// iPay BT sandbox/prod via IPAY_BASE_URL + Basic Auth.
//
// IMPORTANT: Pentru proiectul nostru avem 2 operatori.
// Credentialele pot diferi pe operator, de aceea functiile accepta override:
//   registerDo(opts, { baseUrl, user, pass })
// Daca override nu e trimis, se folosesc variabilele clasice IPAY_BASE_URL / IPAY_USER / IPAY_PASS.

function mustEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`[iPay] Lipseste ${name} in .env`);
  return String(v).trim();
}

function resolveBaseUrl(override) {
  let url = (override && override.baseUrl) ? String(override.baseUrl).trim() : mustEnv('IPAY_BASE_URL');
  if (url.endsWith('/')) url = url.slice(0, -1);
  return url;
}

function resolveUserPass(override) {
  const user = (override && override.user) ? String(override.user).trim() : mustEnv('IPAY_USER');
  const pass = (override && override.pass) ? String(override.pass).trim() : mustEnv('IPAY_PASS');
  return { user, pass };
}

function basicAuthHeader(override) {
  const { user, pass } = resolveUserPass(override);
  const b64 = Buffer.from(`${user}:${pass}`, 'utf8').toString('base64');
  return `Basic ${b64}`;
}

function toForm(params) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null) continue;
    body.set(k, String(v));
  }
  return body;
}

async function postForm(path, params, override) {
  const url = `${resolveBaseUrl(override)}${path.startsWith('/') ? '' : '/'}${path}`;

    // ===== DEBUG IPAY (TEMPORAR) =====
  if (path === '/register.do' || path === '/registerPreAuth.do') {
    const safe = { ...params };

    // mascăm date sensibile în log
    if (safe.email) {
      safe.email = String(safe.email).replace(/(.{2}).+(@.*)/, '$1***$2');
    }

if (safe.orderBundle) {
  try {
    safe.orderBundle = JSON.stringify(
      JSON.parse(String(safe.orderBundle)),
      null,
      2
    );
  } catch (e) {
    // fallback dacă nu e JSON valid (nu ar trebui, dar e safe)
    safe.orderBundle = String(safe.orderBundle);
  }
}



    console.log('------------------------------------------------');
    console.log('[IPAY][OUTGOING]', path, safe);
    console.log('------------------------------------------------');
  }
  // ===== END DEBUG IPAY =====


  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuthHeader(override),
    },
    body: toForm(params),
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const err = new Error(`[iPay] HTTP ${res.status}`);
    err.payload = data;
    throw err;
  }
  return data;
}

async function registerDo(
  {
    orderNumber,
    amountMinor,
    currency = 946,
    returnUrl,
    description,
    email,
    orderBundle,
    sessionTimeoutSecs = 420, // expira in ... secunde 
  },
  override
) {

  // register.do (1-phase)
  return postForm('/register.do', {
    orderNumber,
    amount: amountMinor,
    currency,
    returnUrl,
    description,
    email,
    sessionTimeoutSecs,
    orderBundle: orderBundle ? JSON.stringify(orderBundle) : undefined,
  }, override);

}

async function getOrderStatusExtendedDo({ orderId }, override) {
  return postForm('/getOrderStatusExtended.do', { orderId }, override);
}

async function refundDo({ orderId, amountMinor }, override) {
  return postForm('/refund.do', { orderId, amount: amountMinor }, override);
}

module.exports = {
  registerDo,
  getOrderStatusExtendedDo,
  refundDo,
};
