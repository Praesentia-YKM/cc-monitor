const fs = require('fs');

const MAX_ACCUMULATED = 5000; // 메모리 누수 방지 상한
const lineCache = new Map();

function readJsonlFile(filePath, fromLine = 0) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    const entries = [];
    for (let i = fromLine; i < lines.length; i++) {
      try {
        entries.push(JSON.parse(lines[i]));
      } catch {
        // skip malformed lines
      }
    }
    return { entries, totalLines: lines.length };
  } catch {
    return { entries: [], totalLines: 0 };
  }
}

function readJsonlIncremental(filePath) {
  const cached = lineCache.get(filePath) || { lastLine: 0, accumulated: [] };
  const { entries, totalLines } = readJsonlFile(filePath, cached.lastLine);

  cached.accumulated = cached.accumulated.concat(entries);

  // 상한 초과 시 앞쪽 버림 (최근 데이터 유지)
  if (cached.accumulated.length > MAX_ACCUMULATED) {
    cached.accumulated = cached.accumulated.slice(-MAX_ACCUMULATED);
  }

  cached.lastLine = totalLines;
  lineCache.set(filePath, cached);

  return cached.accumulated;
}

function resetCache(filePath) {
  if (filePath) {
    lineCache.delete(filePath);
  } else {
    lineCache.clear();
  }
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

module.exports = { readJsonlFile, readJsonlIncremental, resetCache, readJsonFile };
