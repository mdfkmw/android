const db = require('../db');

function serializePayload(payload) {
  if (!payload) return null;
  if (typeof payload === 'string') return payload;
  try {
    return JSON.stringify(payload);
  } catch {
    return null;
  }
}

async function writeAudit({
  actorId = null,
  entity,
  entityId = null,
  action,
  relatedEntity = null,
  relatedId = null,
  note = null,
  before = null,
  after = null,
}) {
  try {
    await db.query(
      `INSERT INTO audit_logs
        (created_at, actor_id, entity, entity_id, action, related_entity, related_id, correlation_id, channel, amount, payment_method, transaction_id, note, before_json, after_json)
       VALUES (NOW(), ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?, ?)` ,
      [
        actorId || null,
        entity,
        entityId || null,
        action,
        relatedEntity || null,
        relatedId || null,
        note || null,
        serializePayload(before),
        serializePayload(after),
      ],
    );
  } catch (err) {
    console.warn('[audit] writeAudit failed', err.message);
  }
}

module.exports = { writeAudit };
