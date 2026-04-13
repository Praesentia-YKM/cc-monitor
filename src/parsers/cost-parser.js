const { readJsonFile } = require('../utils/jsonl-reader');
const config = require('../config');

function parseCost(sessionId) {
  const data = readJsonFile(config.COST_FILE);
  if (!data || !Array.isArray(data.data)) {
    return { todayTotal: null, hasData: false };
  }

  let todayTotal = 0;
  let sessionTotal = 0;

  for (const entry of data.data) {
    const cost = entry.costUSD || 0;
    todayTotal += cost;
    if (entry.sessionId === sessionId) {
      sessionTotal += cost;
    }
  }

  return { todayTotal, sessionTotal, hasData: true };
}

module.exports = { parseCost };
