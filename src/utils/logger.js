const fs = require('fs');
const path = require('path');
const config = require('../config');

let debugEnabled = false;
let logStream = null;

function init(debug) {
  debugEnabled = !!debug;
  if (debugEnabled) {
    const logPath = path.join(config.CLAUDE_DIR, 'monitor', 'debug.log');
    logStream = fs.createWriteStream(logPath, { flags: 'a' });
    log('info', 'Debug logging started');
  }
}

function log(level, msg, detail) {
  if (!debugEnabled || !logStream) return;
  const ts = new Date().toISOString();
  const line = detail
    ? `[${ts}] ${level.toUpperCase()}: ${msg} — ${JSON.stringify(detail)}`
    : `[${ts}] ${level.toUpperCase()}: ${msg}`;
  logStream.write(line + '\n');
}

function close() {
  if (logStream) {
    log('info', 'Debug logging stopped');
    logStream.end();
    logStream = null;
  }
}

module.exports = { init, log, close };
