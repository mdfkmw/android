// backend/sockets/emitters.js
let intentsNsp = null;

function setIntentsNamespace(nsp) {
  intentsNsp = nsp;
}

function emitIntentUpdate(tripId) {
  if (!intentsNsp) return;
  intentsNsp.to(`trip:${tripId}`).emit('intents:update', { tripId });
  intentsNsp.to(`trip:${tripId}`).emit('trip:update', { tripId });
}

function emitTripUpdate(tripId) {
  if (!intentsNsp) return;
  intentsNsp.to(`trip:${tripId}`).emit('trip:update', { tripId });
}


module.exports = {
  setIntentsNamespace,
  emitIntentUpdate,
  emitTripUpdate,
};
