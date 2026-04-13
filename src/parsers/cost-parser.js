const { readJsonFile } = require('../utils/jsonl-reader');
const config = require('../config');

function parseCost() {
  const data = readJsonFile(config.COST_FILE);
  if (!data || !Array.isArray(data.data)) {
    return { todayTotal: null, hasData: false };
  }

  let todayTotal = 0;
  for (const entry of data.data) {
    todayTotal += entry.costUSD || 0;
  }

  return { todayTotal, hasData: true };
}

module.exports = { parseCost };
