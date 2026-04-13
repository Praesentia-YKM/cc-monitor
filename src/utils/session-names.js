const fs = require('fs');
const path = require('path');
const config = require('../config');

const NAMES_FILE = path.join(config.CLAUDE_DIR, 'monitor', 'session-names.json');

function loadNames() {
  try {
    return JSON.parse(fs.readFileSync(NAMES_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveName(sessionId, name) {
  try {
    const names = loadNames();
    if (name && name.trim()) {
      names[sessionId] = name.trim();
    } else {
      delete names[sessionId];
    }
    const dir = path.dirname(NAMES_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(NAMES_FILE, JSON.stringify(names, null, 2), 'utf-8');
  } catch {
    // 쓰기 실패 시 무시 (TUI 안정성 우선)
  }
}

function getName(sessionId) {
  const names = loadNames();
  return names[sessionId] || null;
}

module.exports = { loadNames, saveName, getName };
