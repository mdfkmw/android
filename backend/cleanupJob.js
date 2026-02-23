// cleanupJob.js
require("dotenv").config();
const db = require("./db");

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────
const LOCK_NAME = process.env.CLEANUP_LOCK_NAME || "events_cleanup_lock";

// Buffer după expires_at (ca să nu expiri fix la secundă)
const GRACE_MINUTES = Number(process.env.CLEANUP_GRACE_MINUTES || 2);

// Dacă există activitate iPay în ultimele X minute, nu expirăm order-ul
const IPAY_RECENT_MINUTES = Number(process.env.CLEANUP_IPAY_RECENT_MINUTES || 15);

// Dacă un agent_job rămâne blocat (queued/in_progress), îl marcăm error.
// Prioritate configurare:
//  - AGENT_JOB_STUCK_SECONDS (nou, granular)
//  - AGENT_JOB_STUCK_MINUTES (compatibilitate înapoi)
const AGENT_JOB_STUCK_SECONDS_RAW = Number(process.env.AGENT_JOB_STUCK_SECONDS || 0);
const AGENT_JOB_STUCK_SECONDS = AGENT_JOB_STUCK_SECONDS_RAW > 0
  ? AGENT_JOB_STUCK_SECONDS_RAW
  : Number(process.env.AGENT_JOB_STUCK_MINUTES || 10) * 60;


// Intervalul de rulare
const INTERVAL_MS = Number(process.env.CLEANUP_JOB_INTERVAL_MS || 60_000);

// Token protection (jobul NU pornește fără token corect)
const EXPECTED_TOKEN = process.env.CLEANUP_JOB_TOKEN;
const PASSED_TOKEN = process.env.CLEANUP_JOB_RUN_TOKEN; // îl setezi în .env, nu în cod

// Enable/disable
const ENABLED = String(process.env.CLEANUP_JOB_ENABLED || "1") === "1";

async function runCleanup(reason = "interval") {
  const tag = `[cleanupJob ${reason} ${new Date().toISOString()}]`;

  // 1) Lock anti-paralelism (dacă rulează deja, ieșim)
  const lockRes = await db.query("SELECT GET_LOCK(?, 1) AS got", [LOCK_NAME]);
  const got = lockRes.rows?.[0]?.got;

  if (!got) {
    // alt proces rulează deja cleanup-ul
    return { ok: true, skipped: true };
  }

  try {
    // 2) Expiră orders pending -> expired
    // Protecții:
    // - expires_at trecut + grace
    // - nu expiră dacă există un payment ipay recent în payments_public_orders (timestamp)
    const expireOrders = await db.query(
      `
      UPDATE orders o
      LEFT JOIN payments_public_orders p
        ON p.order_id = o.id
        AND p.provider = 'ipay'
        AND p.timestamp >= (NOW() - INTERVAL ? MINUTE)
      SET o.status = 'expired'
      WHERE o.status = 'pending'
        AND o.expires_at IS NOT NULL
        AND o.expires_at <= (NOW() - INTERVAL ? MINUTE)
        AND (o.payment_provider = 'ipay' OR o.payment_provider IS NULL)
        AND p.id IS NULL
      `,
      [IPAY_RECENT_MINUTES, GRACE_MINUTES]
    );

    // 3) Șterge intents expirate (hold-uri)
    const deleteExpiredIntents = await db.query(
      `
      DELETE FROM reservation_intents
      WHERE expires_at IS NOT NULL
        AND expires_at <= NOW()
      `
    );

    // 4) Curățenie: intents rămase pentru orders finalizate
    const deleteIntentsForFinalOrders = await db.query(
      `
      DELETE ri
      FROM reservation_intents ri
      JOIN orders o ON o.id = ri.order_id
      WHERE o.status IN ('paid','failed','expired','cancelled')
      `
    );


    // 5) Cleanup: agent_jobs blocate (agentul e căzut/offline sau nu mai trimite report)
    const markStuckAgentJobs = await db.query(
      `
  UPDATE agent_jobs
  SET status = 'error',
      error_message = CONCAT('timeout: stuck ', status, ' > ', ?, ' seconds')
  WHERE status IN ('queued', 'in_progress')
    AND updated_at < (NOW() - INTERVAL ? SECOND)
  `,
      [AGENT_JOB_STUCK_SECONDS, AGENT_JOB_STUCK_SECONDS]
    );


console.log(
  `${tag} OK: expiredOrders=${expireOrders.rowCount || 0}, ` +
    `deletedExpiredIntents=${deleteExpiredIntents.rowCount || 0}, ` +
    `deletedIntentsForFinalOrders=${deleteIntentsForFinalOrders.rowCount || 0}, ` +
    `stuckAgentJobs=${markStuckAgentJobs.rowCount || 0}`
);


    return {
      ok: true,
      expiredOrders: expireOrders.rowCount || 0,
      deletedExpiredIntents: deleteExpiredIntents.rowCount || 0,
      deletedIntentsForFinalOrders: deleteIntentsForFinalOrders.rowCount || 0,
      skipped: false,
    };
  } catch (err) {
    console.error(`${tag} ERROR:`, err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  } finally {
    try {
      await db.query("SELECT RELEASE_LOCK(?)", [LOCK_NAME]);
    } catch (_) { }
  }
}

function startCleanupJob() {
  // ─────────────────────────────────────────────────────────────
  // TOKEN PROTECTION (nu pornește fără token)
  // ─────────────────────────────────────────────────────────────
  if (!EXPECTED_TOKEN) {
    console.error("[cleanupJob] ERROR: CLEANUP_JOB_TOKEN missing in .env");
    return;
  }
  if (!PASSED_TOKEN || PASSED_TOKEN !== EXPECTED_TOKEN) {
    console.error("[cleanupJob] UNAUTHORIZED: invalid CLEANUP_JOB_RUN_TOKEN");
    return;
  }

  if (!ENABLED) {
    console.log("[cleanupJob] disabled by CLEANUP_JOB_ENABLED=0");
    return;
  }

  console.log(
    `[cleanupJob] started: interval=${INTERVAL_MS}ms, grace=${GRACE_MINUTES}m, ipayRecent=${IPAY_RECENT_MINUTES}m`
  );

  // rulează o dată la startup + apoi periodic
  runCleanup("startup").catch(() => { });
  setInterval(() => runCleanup("interval").catch(() => { }), INTERVAL_MS);
}

module.exports = { startCleanupJob, runCleanup };
