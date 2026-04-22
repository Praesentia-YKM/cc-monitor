const logger = require('../utils/logger');

function collectAgentToolUses(entries) {
  const map = new Map();
  for (const entry of entries) {
    if (entry.type !== 'assistant' || !entry.message) continue;
    const content = entry.message.content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (block.type === 'tool_use' && block.name === 'Agent' && block.id) {
        map.set(block.id, {
          description: (block.input && block.input.description) || '',
          subagentType: (block.input && block.input.subagent_type) || '',
          timestamp: entry.timestamp || null,
        });
      }
    }
  }
  return map;
}

module.exports = { collectAgentToolUses };
