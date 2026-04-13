const { readJsonlFile } = require('../utils/jsonl-reader');
const { parseTimestamp, formatTime } = require('../utils/time-format');
const config = require('../config');

function parseSkillHistory(sessionId) {
  const { entries } = readJsonlFile(config.HISTORY_FILE);
  const skills = entries
    .filter(e => e.sessionId === sessionId && e.display)
    .map(e => {
      const ts = parseTimestamp(e.timestamp);
      return { name: e.display, timestamp: ts, timeStr: formatTime(ts) };
    })
    .sort((a, b) => b.timestamp - a.timestamp);

  return skills.slice(0, 10);
}

module.exports = { parseSkillHistory };
