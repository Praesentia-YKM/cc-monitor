const fs = require('fs');
const path = require('path');
const { readJsonFile, readJsonlFile } = require('../utils/jsonl-reader');
const { parseTimestamp } = require('../utils/time-format');
const { countTools } = require('../utils/tool-counter');
const logger = require('../utils/logger');

const NOISE_PATTERNS = [
  /^exit code \d+$/i,
  /^cancelled/i,
  /^<tool_use_error>/,
  /parallel tool call/i,
  /command (exited|failed) with/i,
  /^UP-TO-DATE$/,
];

function isNoiseError(text) {
  return NOISE_PATTERNS.some(re => re.test(text.trim()));
}

function extractErrorText(block) {
  if (typeof block.content === 'string') return block.content;
  if (Array.isArray(block.content) && block.content[0] && block.content[0].text) return block.content[0].text;
  return '';
}

function extractDiagnostics(entries) {
  const errors = [];
  let deniedCount = 0;
  let lastActivity = '';
  const toolSequence = [];

  for (const entry of entries) {
    if (entry.type === 'assistant' && entry.message) {
      const content = entry.message.content;
      if (!Array.isArray(content)) continue;

      for (const block of content) {
        if (block.type === 'tool_use' && block.name) {
          toolSequence.push(block.name);
        }
        if (block.type === 'text' && block.text) {
          lastActivity = block.text;
        }
        if (block.type === 'tool_result' && block.is_error) {
          const errText = extractErrorText(block);
          if (errText && !isNoiseError(errText)) {
            errors.push(errText);
          }
        }
      }
    }

    if (entry.type === 'user' && entry.message) {
      const content = entry.message.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (block.type === 'tool_result' && block.is_error) {
          const errText = extractErrorText(block);
          if (/denied|permission|not allowed/i.test(errText)) {
            deniedCount++;
          } else if (errText && !isNoiseError(errText)) {
            errors.push(errText);
          }
        }
      }
    }
  }

  const repeatPattern = detectRepeatPattern(toolSequence);

  return { errors, deniedCount, lastActivity, repeatPattern };
}

function detectRepeatPattern(sequence) {
  if (sequence.length < 6) return null;

  const tail = sequence.slice(-20);
  const counts = {};
  for (const name of tail) {
    counts[name] = (counts[name] || 0) + 1;
  }

  for (const [name, count] of Object.entries(counts)) {
    if (count >= 6 && count / tail.length > 0.5) {
      return { tool: name, count };
    }
  }
  return null;
}

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
      let parentToolUseID = null;
      const tools = {};
      let diagnostics = { errors: [], deniedCount: 0, lastActivity: '', repeatPattern: null };

      if (fs.existsSync(jsonlPath)) {
        const { entries } = readJsonlFile(jsonlPath);
        if (entries.length > 0) {
          startTime = entries[0].timestamp;
          parentToolUseID = entries[0].parentToolUseID || null;
          const lastEntry = entries[entries.length - 1];

          if (lastEntry.type === 'end-of-session') {
            isRunning = false;
            endTime = lastEntry.timestamp;
          } else if (lastEntry.type === 'assistant' && lastEntry.timestamp) {
            const lastContent = lastEntry.message && Array.isArray(lastEntry.message.content)
              ? lastEntry.message.content : [];
            const hasToolUse = lastContent.some(b => b.type === 'tool_use');
            const lastTime = parseTimestamp(lastEntry.timestamp).getTime();
            const idleMs = Date.now() - lastTime;

            if (!hasToolUse && idleMs > 30 * 1000) {
              isRunning = false;
              endTime = lastEntry.timestamp;
            }
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
            countTools(tools, entry.message.content);
          }
        }

        diagnostics = extractDiagnostics(entries);
        if (diagnostics.errors.length > 0 || diagnostics.repeatPattern) {
          logger.log('debug', `Agent ${agentId} diagnostics`, {
            errors: diagnostics.errors.length,
            denied: diagnostics.deniedCount,
            repeat: diagnostics.repeatPattern,
          });
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
        startTime,
        endTime,
        elapsedMs: elapsed,
        tokensIn,
        tokensOut,
        tools,
        diagnostics,
        parentToolUseID,
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

module.exports = { parseSubagents, extractDiagnostics, detectRepeatPattern };
