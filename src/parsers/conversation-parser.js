const { readJsonlIncremental } = require('../utils/jsonl-reader');
const { parseTimestamp, formatTime } = require('../utils/time-format');

function parseConversation(jsonlPath) {
  const entries = readJsonlIncremental(jsonlPath);
  const pairs = [];
  let currentUser = null;

  for (const entry of entries) {
    if (entry.type === 'user' && entry.message && Array.isArray(entry.message.content)) {
      const hasImage = entry.message.content.some(c => c.type === 'image');
      const texts = entry.message.content
        .filter(c => c.type === 'text')
        .map(c => c.text.replace(/\[Image[^\]]*\]/g, '').trim())
        .filter(t => t.length > 0);
      const userText = texts.length > 0
        ? (hasImage ? '[img] ' : '') + texts[0]
        : (hasImage ? '[img]' : '');
      if (userText.length > 0) {
        currentUser = { text: userText, ts: entry.timestamp };
      }
    }

    if (entry.type === 'assistant' && entry.message && Array.isArray(entry.message.content) && currentUser) {
      const texts = entry.message.content
        .filter(c => c.type === 'text')
        .map(c => c.text.trim())
        .filter(t => t.length > 0);
      if (texts.length > 0) {
        const ts = parseTimestamp(currentUser.ts);
        pairs.push({
          userText: currentUser.text,
          aiText: texts[0],
          timestamp: ts,
          timeStr: formatTime(ts),
        });
        currentUser = null;
      }
    }
  }

  return pairs;
}

module.exports = { parseConversation };
