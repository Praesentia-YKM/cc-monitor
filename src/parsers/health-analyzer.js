const fs = require('fs');
const path = require('path');

const PATTERNS_PATH = path.join(__dirname, '..', '..', 'references', 'error-patterns.md');

let cachedPatterns = null;
function loadErrorPatterns() {
  if (cachedPatterns) return cachedPatterns;
  if (!fs.existsSync(PATTERNS_PATH)) {
    cachedPatterns = [];
    return cachedPatterns;
  }
  const text = fs.readFileSync(PATTERNS_PATH, 'utf8');
  cachedPatterns = text.split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('=='));
  return cachedPatterns;
}

function truncate(s, n = 80) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '...' : s;
}

function formatDuration(ms) {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function detectInternalError(subagent) {
  if (subagent.isRunning) return null;
  const errors = (subagent.diagnostics && subagent.diagnostics.errors) || [];
  if (errors.length === 0) return null;

  const patterns = loadErrorPatterns();
  for (const err of errors) {
    for (const pattern of patterns) {
      if (err.includes(pattern)) {
        return {
          type: 'internal-error',
          severity: 'critical',
          message: `Anthropic 내부 에러: "${pattern}"`,
          since: subagent.endTime || subagent.startTime
        };
      }
    }
  }

  return {
    type: 'internal-error',
    severity: 'critical',
    message: `에러 ${errors.length}건: ${truncate(errors[errors.length - 1])}`,
    since: subagent.endTime || subagent.startTime
  };
}

function detectStalled(subagent, now, config) {
  if (!subagent.isRunning) return null;
  const lastActivity = (subagent.diagnostics && subagent.diagnostics.lastActivity) || subagent.startTime;
  if (!lastActivity) return null;

  const lastMs = new Date(lastActivity).getTime();
  if (Number.isNaN(lastMs)) return null;

  const idleMs = now - lastMs;

  if (idleMs >= config.stalledCriticalSec * 1000) {
    return {
      type: 'stalled',
      severity: 'critical',
      message: `${formatDuration(idleMs)}간 출력 없음`,
      since: lastActivity
    };
  }
  if (idleMs >= config.stalledWarningSec * 1000) {
    return {
      type: 'stalled',
      severity: 'warning',
      message: `${formatDuration(idleMs)}간 출력 없음`,
      since: lastActivity
    };
  }
  return null;
}

function detectRetryLoop(subagent, config) {
  const rp = subagent.diagnostics && subagent.diagnostics.repeatPattern;
  if (!rp) return null;
  const threshold = config.retryThresholdN || 3;
  if (rp.count < threshold) return null;

  return {
    type: 'retry-loop',
    severity: 'warning',
    message: `같은 ${rp.tool} 호출 ${rp.count}회 연속`,
    since: (subagent.diagnostics && subagent.diagnostics.lastActivity) || subagent.startTime,
    evidence: { tool: rp.tool, count: rp.count }
  };
}

function analyzeHealth(subagent, now, config) {
  const signals = [
    detectInternalError(subagent),
    detectStalled(subagent, now, config),
    detectRetryLoop(subagent, config)
  ].filter(Boolean);

  const severities = signals.map((s) => s.severity);
  const worstSeverity = severities.includes('critical') ? 'critical'
                      : severities.includes('warning') ? 'warning'
                      : null;
  return {
    status: worstSeverity || 'ok',
    signals,
    worstSeverity
  };
}

module.exports = {
  loadErrorPatterns,
  analyzeHealth,
  detectInternalError,
  detectStalled,
  detectRetryLoop
};
