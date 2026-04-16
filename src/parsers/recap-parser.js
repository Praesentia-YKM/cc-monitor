const { readJsonlIncremental } = require('../utils/jsonl-reader');
const { parseTimestamp, formatTime, formatTokenCount } = require('../utils/time-format');

function parseRecaps(jsonlPath) {
  const entries = readJsonlIncremental(jsonlPath);
  const recaps = [];
  let pendingBoundary = null;

  for (const entry of entries) {
    if (entry.type === 'system' && entry.subtype === 'compact_boundary') {
      pendingBoundary = {
        timestamp: entry.timestamp,
        timeStr: entry.timestamp ? formatTime(parseTimestamp(entry.timestamp)) : '',
        preTokens: entry.compactMetadata?.preTokens || 0,
        postTokens: entry.compactMetadata?.postTokens || 0,
        durationMs: entry.compactMetadata?.durationMs || 0,
        summary: null,
        userMessages: [],
        currentWork: '',
      };
      continue;
    }

    if (pendingBoundary
      && entry.type === 'user'
      && typeof entry.message?.content === 'string'
      && entry.message.content.includes('This session is being continued')) {

      const content = entry.message.content;
      pendingBoundary.summary = extractSection(content, 'Primary Request and Intent');
      pendingBoundary.userMessages = extractUserMessages(content);
      pendingBoundary.currentWork = extractSection(content, 'Current Work');
      recaps.push(pendingBoundary);
      pendingBoundary = null;
      continue;
    }

    if (pendingBoundary && entry.type !== 'progress') {
      recaps.push(pendingBoundary);
      pendingBoundary = null;
    }
  }

  if (pendingBoundary) {
    recaps.push(pendingBoundary);
  }

  return recaps;
}

function extractSection(content, sectionName) {
  const regex = new RegExp(`\\d+\\.\\s+${escapeRegex(sectionName)}:\\s*\\n([\\s\\S]*?)(?=\\n\\d+\\.|$)`);
  const match = content.match(regex);
  if (!match) return '';
  return match[1].trim().substring(0, 500);
}

function extractUserMessages(content) {
  const section = extractSection(content, 'All User Messages');
  if (!section) return [];
  const msgs = [];
  const regex = /- "(.+?)"/g;
  let m;
  while ((m = regex.exec(section)) !== null) {
    msgs.push(m[1].substring(0, 80));
  }
  return msgs;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { parseRecaps };
