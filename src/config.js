const path = require('path');
const os = require('os');

const CLAUDE_DIR = path.join(os.homedir(), '.claude');

module.exports = {
  CLAUDE_DIR,
  SESSIONS_DIR: path.join(CLAUDE_DIR, 'sessions'),
  PROJECTS_DIR: path.join(CLAUDE_DIR, 'projects'),
  HISTORY_FILE: path.join(CLAUDE_DIR, 'history.jsonl'),
  COST_FILE: path.join(CLAUDE_DIR, 'powerline', 'usage', 'today.json'),

  POLL_INTERVAL_MS: 2000,
  CONTEXT_WARN_THRESHOLD: 0.8,
  MAX_ACCUMULATED_EVENTS: parseInt(process.env.CC_MONITOR_MAX_EVENTS, 10) || 20000,

  // @deprecated — use getMaxContext() in utils/format-model.js. Kept for compat.
  MODEL_MAX_CONTEXT: {
    'claude-opus-4-6': 200000,
    'claude-sonnet-4-6': 200000,
    'claude-haiku-4-5-20251001': 200000,
    default: 200000,
  },

  COLORS: {
    border: 'cyan',
    title: 'white',
    label: 'gray',
    value: 'white',
    warn: 'yellow',
    error: 'red',
    success: 'green',
    running: 'green',
    completed: 'gray',
    accent: 'cyan',
    dim: 'gray',
    bright: 'white',
  },

  healthAnalyzer: {
    stalledWarningSec: 300,
    stalledCriticalSec: 600,
    retryThresholdN: 3,
    retryWithSameErrorN: 2,
    topIssuesCount: 3,
  },

  ICONS: {
    session: '\u25C9',    // ◉
    model: '\u2666',      // ♦
    context: '\u2588',    // █ (progress bar fill)
    contextEmpty: '\u2591', // ░ (progress bar empty)
    clock: '\u25F7',      // ◷
    idle: '\u23F8',       // ⏸
    msg: '\u25AC',        // ▬
    token: '\u25A0',      // ■
    tool: '\u25B6',       // ▶
    agent: '\u25CF',      // ●
    agentDone: '\u2713',  // ✓
    skill: '\u2605',      // ★
    cost: '\u25C8',       // ◈
    file: '\u25A3',       // ▣
    edit: '\u270E',       // ✎
    read: '\u25B7',       // ▷
    task: '\u25CB',       // ○
    taskDone: '\u25CF',   // ●
    separator: '\u2502',  // │
    folder: '\u25B8',     // ▸
    recap: '\u21BB',      // ↻
    warn: '\u26A0',       // ⚠
  },
};
