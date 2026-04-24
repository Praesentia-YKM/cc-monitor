const fs = require('fs');
const config = require('../config');
const logger = require('./logger');

const lineCache = new Map();
const offsetCache = new Map();

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
  } catch (e) {
    logger.log('warn', `readJsonlFile failed: ${filePath}`, e.message);
    return { entries: [], totalLines: 0 };
  }
}

function readJsonlIncremental(filePath) {
  const cached = lineCache.get(filePath) || { lastLine: 0, accumulated: [] };
  const byteOffset = offsetCache.get(filePath) || 0;

  let newEntries = [];

  try {
    const stat = fs.statSync(filePath);
    if (stat.size <= byteOffset) {
      // 파일 크기 변경 없음 → 새 데이터 없음
      return cached.accumulated;
    }

    // 바이트 오프셋부터 신규 데이터만 읽기
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(stat.size - byteOffset);
    fs.readSync(fd, buf, 0, buf.length, byteOffset);
    fs.closeSync(fd);

    const chunk = buf.toString('utf-8');
    const lines = chunk.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        newEntries.push(JSON.parse(trimmed));
      } catch {
        // skip malformed lines
      }
    }

    offsetCache.set(filePath, stat.size);
  } catch (e) {
    logger.log('warn', `readJsonlIncremental failed: ${filePath}`, e.message);
    return cached.accumulated;
  }

  cached.accumulated = cached.accumulated.concat(newEntries);

  const maxAccumulated = config.MAX_ACCUMULATED_EVENTS;
  if (cached.accumulated.length > maxAccumulated) {
    cached.accumulated = cached.accumulated.slice(-maxAccumulated);
  }

  cached.lastLine = cached.lastLine + newEntries.length;
  lineCache.set(filePath, cached);

  return cached.accumulated;
}

function resetCache(filePath) {
  if (filePath) {
    lineCache.delete(filePath);
    offsetCache.delete(filePath);
  } else {
    lineCache.clear();
    offsetCache.clear();
  }
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    logger.log('warn', `readJsonFile failed: ${filePath}`, e.message);
    return null;
  }
}

module.exports = { readJsonlFile, readJsonlIncremental, resetCache, readJsonFile };
