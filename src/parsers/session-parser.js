const { readJsonlIncremental } = require('../utils/jsonl-reader');
const { parseTimestamp } = require('../utils/time-format');
const { countTools } = require('../utils/tool-counter');
const config = require('../config');

function parseSession(jsonlPath) {
  const entries = readJsonlIncremental(jsonlPath);

  const result = {
    model: null,
    userMessages: 0,
    assistantMessages: 0,
    tokens: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
    lastContextSize: 0,
    tools: {},
    lastTimestamp: null,
    firstTimestamp: null,
  };

  for (const entry of entries) {
    if (!result.firstTimestamp && entry.timestamp) {
      result.firstTimestamp = entry.timestamp;
    }
    if (entry.timestamp) {
      result.lastTimestamp = entry.timestamp;
    }

    if (entry.type === 'user') {
      result.userMessages++;
    }

    if (entry.type === 'assistant' && entry.message) {
      result.assistantMessages++;

      if (entry.message.model) {
        result.model = entry.message.model;
      }

      const usage = entry.message.usage;
      if (usage) {
        result.tokens.input += usage.input_tokens || 0;
        result.tokens.output += usage.output_tokens || 0;
        result.tokens.cacheWrite += usage.cache_creation_input_tokens || 0;
        result.tokens.cacheRead += usage.cache_read_input_tokens || 0;
        result.lastContextSize = (usage.input_tokens || 0)
          + (usage.cache_creation_input_tokens || 0)
          + (usage.cache_read_input_tokens || 0);
      }

      countTools(result.tools, entry.message.content);
    }
  }

  return result;
}

function calcContextPercent(sessionData) {
  const model = sessionData.model || 'default';
  const maxCtx = config.MODEL_MAX_CONTEXT[model] || config.MODEL_MAX_CONTEXT.default;
  const ctxSize = sessionData.lastContextSize;
  if (ctxSize <= 0 || maxCtx <= 0) return 0;
  return Math.min(Math.round((ctxSize / maxCtx) * 100), 100);
}

function calcIdleTime(sessionData) {
  if (!sessionData.lastTimestamp) return 0;
  const last = parseTimestamp(sessionData.lastTimestamp);
  return Date.now() - last.getTime();
}

function calcAge(session, sessionData) {
  const start = session.startedAt
    ? new Date(session.startedAt)
    : (sessionData.firstTimestamp ? parseTimestamp(sessionData.firstTimestamp) : new Date());
  return Date.now() - start.getTime();
}

module.exports = { parseSession, calcContextPercent, calcIdleTime, calcAge };
