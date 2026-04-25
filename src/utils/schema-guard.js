const logger = require('./logger');

const seenMisses = new Set();

function recordSchemaMiss(context, details) {
  const key = `${context}:${JSON.stringify(details)}`;
  if (seenMisses.has(key)) return;
  seenMisses.add(key);
  logger.log('warn', `schema_miss ${context}`, details);
}

function hasField(obj, path) {
  if (!obj) return false;
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return false;
    if (!(p in cur)) return false;
    cur = cur[p];
  }
  return true;
}

function resetSeenMisses() {
  seenMisses.clear();
}

module.exports = { recordSchemaMiss, hasField, resetSeenMisses };
