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
      let model = null;
      let tokensIn = 0;
      let tokensOut = 0;
      const tools = {};

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

        for (const entry of entries) {
          if (entry.type === 'assistant' && entry.message) {
            if (entry.message.model && !model) {
              model = entry.message.model;
            }
            const usage = entry.message.usage;
            if (usage) {
              tokensIn += (usage.input_tokens || 0)
                + (usage.cache_creation_input_tokens || 0)
                + (usage.cache_read_input_tokens || 0);
              tokensOut += usage.output_tokens || 0;
            }
            const content = entry.message.content;
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === 'tool_use' && block.name) {
                  tools[block.name] = (tools[block.name] || 0) + 1;
                }
              }
            }
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
        model,
        isRunning,
        elapsedMs: elapsed,
        tokensIn,
        tokensOut,
        tools,
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
