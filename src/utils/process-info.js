const { execSync } = require('child_process');
const logger = require('./logger');

const startTimeCache = new Map();

function getProcessStartTime(pid) {
  if (!pid || typeof pid !== 'number') return null;
  if (startTimeCache.has(pid)) return startTimeCache.get(pid);
  try {
    if (process.platform === 'win32') {
      const out = execSync(
        `wmic process where processid=${pid} get creationdate /value`,
        { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 }
      );
      const m = out.match(/CreationDate=(\d{14}\.\d+)/);
      if (!m) return null;
      const s = m[1];
      const iso = `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(8,10)}:${s.slice(10,12)}:${s.slice(12,14)}`;
      const t = Date.parse(iso);
      const result = isNaN(t) ? null : t;
      if (result !== null) startTimeCache.set(pid, result);
      return result;
    } else {
      const out = execSync(
        `ps -o lstart= -p ${pid}`,
        { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 }
      ).trim();
      const t = Date.parse(out);
      const result = isNaN(t) ? null : t;
      if (result !== null) startTimeCache.set(pid, result);
      return result;
    }
  } catch (e) {
    logger.log('debug', `getProcessStartTime failed for pid=${pid}`, e.message);
    return null;
  }
}

function verifyProcessIdentity(pid, expectedStartedAt, toleranceMs = 5000) {
  if (!expectedStartedAt) return true;
  const actualStart = getProcessStartTime(pid);
  if (actualStart === null) return true;
  const expected = typeof expectedStartedAt === 'number'
    ? expectedStartedAt
    : Date.parse(expectedStartedAt);
  if (isNaN(expected)) return true;
  return Math.abs(actualStart - expected) <= toleranceMs;
}

module.exports = { getProcessStartTime, verifyProcessIdentity };
