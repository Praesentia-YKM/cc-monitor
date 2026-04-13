const fs = require('fs');
const path = require('path');
const { readJsonFile, readJsonlFile } = require('../utils/jsonl-reader');
const { parseTimestamp } = require('../utils/time-format');

function parseSubagents(projectDir, sessionId) {
  const subagentsDir = path.join(projectDir, sessionId, 'subagents');
  try {
    if (!fs.existsSync(subagentsDir)) return [];

    const metaFiles = fs.readdirSync(subagentsDir).filter(f => f.endsWith('.meta.json'));
    const agents = [];

    for (const metaFile of metaFiles) {
      const agentId = metaFile.replace('.meta.json', '');
      const meta = readJsonFile(path.join(subagentsDir, metaFile));
      if (!meta) continue;

      const jsonlPath = path.join(subagentsDir, `${agentId}.jsonl`);
      let isRunning = true;
      let startTime = null;
      let endTime = null;

      if (fs.existsSync(jsonlPath)) {
        const { entries } = readJsonlFile(jsonlPath);
        if (entries.length > 0) {
          startTime = entries[0].timestamp;
          const lastEntry = entries[entries.length - 1];
          if (lastEntry.type === 'end-of-session') {
            isRunning = false;
            endTime = lastEntry.timestamp;
          }
        }
      }

      const elapsed = startTime
        ? (isRunning ? Date.now() - parseTimestamp(startTime).getTime()
                     : parseTimestamp(endTime).getTime() - parseTimestamp(startTime).getTime())
        : 0;

      agents.push({
        id: agentId,
        type: meta.agentType || 'unknown',
        description: meta.description || '',
        isRunning,
        elapsedMs: elapsed,
      });
    }

    agents.sort((a, b) => {
      if (a.isRunning !== b.isRunning) return a.isRunning ? -1 : 1;
      return b.elapsedMs - a.elapsedMs;
    });

    return agents;
  } catch {
    return [];
  }
}

module.exports = { parseSubagents };
