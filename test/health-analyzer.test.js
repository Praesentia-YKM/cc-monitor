const assert = require('assert');
const {
  loadErrorPatterns,
  analyzeHealth,
  detectInternalError,
  detectStalled,
  detectRetryLoop
} = require('../src/parsers/health-analyzer');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e.message}`); }
}

const FULL_CONFIG = {
  stalledWarningSec: 300,
  stalledCriticalSec: 600,
  retryThresholdN: 3,
  retryWithSameErrorN: 2
};

const STALLED_CONFIG = { stalledWarningSec: 300, stalledCriticalSec: 600 };
const RETRY_CONFIG = { retryThresholdN: 3 };

function emptyDiagnostics(overrides = {}) {
  return Object.assign(
    { errors: [], deniedCount: 0, lastActivity: '', lastActivityText: '', repeatPattern: null },
    overrides
  );
}

console.log('\n=== parsers/health-analyzer ===');

test('loadErrorPatterns reads patterns from references/error-patterns.md', () => {
  const patterns = loadErrorPatterns();
  assert(Array.isArray(patterns));
  assert(patterns.includes('Tool result missing due to internal error'));
  assert(patterns.includes('agent stopped unexpectedly'));
  assert(!patterns.some((p) => p.startsWith('#')));
  assert(!patterns.includes(''));
});

test('analyzeHealth returns ok for healthy completed subagent', () => {
  const sub = {
    isRunning: false,
    startTime: '2026-04-28T11:00:00Z',
    endTime: '2026-04-28T11:01:00Z',
    diagnostics: emptyDiagnostics({ lastActivity: '2026-04-28T11:01:00Z' })
  };
  const result = analyzeHealth(sub, Date.parse('2026-04-28T11:01:30Z'), FULL_CONFIG);
  assert.strictEqual(result.status, 'ok');
  assert.deepStrictEqual(result.signals, []);
  assert.strictEqual(result.worstSeverity, null);
});

test('detectInternalError returns null for running subagent', () => {
  const sub = {
    isRunning: true,
    startTime: '2026-04-28T11:00:00Z',
    diagnostics: emptyDiagnostics({ errors: ['some error'] })
  };
  assert.strictEqual(detectInternalError(sub), null);
});

test('detectInternalError matches whitelist pattern in errors', () => {
  const sub = {
    isRunning: false,
    startTime: '2026-04-28T11:00:00Z',
    endTime: '2026-04-28T11:01:00Z',
    diagnostics: emptyDiagnostics({
      errors: ['Tool result missing due to internal error']
    })
  };
  const sig = detectInternalError(sub);
  assert.strictEqual(sig.type, 'internal-error');
  assert.strictEqual(sig.severity, 'critical');
  assert(sig.message.includes('Tool result missing'));
  assert.strictEqual(sig.since, '2026-04-28T11:01:00Z');
});

test('detectInternalError returns generic critical for unknown errors', () => {
  const sub = {
    isRunning: false,
    startTime: '2026-04-28T11:00:00Z',
    endTime: '2026-04-28T11:01:00Z',
    diagnostics: emptyDiagnostics({ errors: ['some unknown failure', 'another one'] })
  };
  const sig = detectInternalError(sub);
  assert.strictEqual(sig.type, 'internal-error');
  assert.strictEqual(sig.severity, 'critical');
  assert(sig.message.includes('에러 2건'));
});

test('detectInternalError returns null when no errors', () => {
  const sub = {
    isRunning: false,
    startTime: '2026-04-28T11:00:00Z',
    endTime: '2026-04-28T11:01:00Z',
    diagnostics: emptyDiagnostics()
  };
  assert.strictEqual(detectInternalError(sub), null);
});

test('detectStalled returns null for completed subagent', () => {
  const sub = {
    isRunning: false,
    startTime: '2026-04-28T11:00:00Z',
    endTime: '2026-04-28T11:01:00Z',
    diagnostics: emptyDiagnostics({ lastActivity: '2026-04-28T11:00:00Z' })
  };
  const now = Date.parse('2026-04-28T11:30:00Z');
  assert.strictEqual(detectStalled(sub, now, STALLED_CONFIG), null);
});

test('detectStalled returns null when running but recent', () => {
  const sub = {
    isRunning: true,
    startTime: '2026-04-28T11:00:00Z',
    diagnostics: emptyDiagnostics({ lastActivity: '2026-04-28T11:00:00Z' })
  };
  const now = Date.parse('2026-04-28T11:01:00Z');
  assert.strictEqual(detectStalled(sub, now, STALLED_CONFIG), null);
});

test('detectStalled returns warning for 6분 idle', () => {
  const sub = {
    isRunning: true,
    startTime: '2026-04-28T11:00:00Z',
    diagnostics: emptyDiagnostics({ lastActivity: '2026-04-28T11:00:00Z' })
  };
  const now = Date.parse('2026-04-28T11:06:00Z');
  const sig = detectStalled(sub, now, STALLED_CONFIG);
  assert.strictEqual(sig.type, 'stalled');
  assert.strictEqual(sig.severity, 'warning');
  assert(sig.message.includes('6m'));
});

test('detectStalled returns critical for 11분 idle', () => {
  const sub = {
    isRunning: true,
    startTime: '2026-04-28T11:00:00Z',
    diagnostics: emptyDiagnostics({ lastActivity: '2026-04-28T11:00:00Z' })
  };
  const now = Date.parse('2026-04-28T11:11:00Z');
  const sig = detectStalled(sub, now, STALLED_CONFIG);
  assert.strictEqual(sig.severity, 'critical');
});

test('detectStalled falls back to startTime when lastActivity empty', () => {
  const sub = {
    isRunning: true,
    startTime: '2026-04-28T11:00:00Z',
    diagnostics: emptyDiagnostics()
  };
  const now = Date.parse('2026-04-28T11:11:00Z');
  const sig = detectStalled(sub, now, STALLED_CONFIG);
  assert.strictEqual(sig.severity, 'critical');
});

test('detectRetryLoop returns null without repeatPattern', () => {
  const sub = {
    isRunning: true,
    startTime: '2026-04-28T11:00:00Z',
    diagnostics: emptyDiagnostics()
  };
  assert.strictEqual(detectRetryLoop(sub, RETRY_CONFIG), null);
});

test('detectRetryLoop returns null when count below threshold', () => {
  const sub = {
    isRunning: true,
    startTime: '2026-04-28T11:00:00Z',
    diagnostics: emptyDiagnostics({ repeatPattern: { tool: 'Bash', count: 2 } })
  };
  assert.strictEqual(detectRetryLoop(sub, RETRY_CONFIG), null);
});

test('detectRetryLoop returns warning when count >= threshold', () => {
  const sub = {
    isRunning: true,
    startTime: '2026-04-28T11:00:00Z',
    diagnostics: emptyDiagnostics({
      lastActivity: '2026-04-28T11:05:00Z',
      repeatPattern: { tool: 'Bash', count: 6 }
    })
  };
  const sig = detectRetryLoop(sub, RETRY_CONFIG);
  assert.strictEqual(sig.type, 'retry-loop');
  assert.strictEqual(sig.severity, 'warning');
  assert(sig.message.includes('Bash'));
  assert(sig.message.includes('6회'));
  assert.strictEqual(sig.evidence.tool, 'Bash');
  assert.strictEqual(sig.evidence.count, 6);
});

test('analyzeHealth aggregates signals (stalled critical + retry-loop warning)', () => {
  const sub = {
    isRunning: true,
    startTime: '2026-04-28T11:00:00Z',
    diagnostics: emptyDiagnostics({
      lastActivity: '2026-04-28T11:00:00Z',
      repeatPattern: { tool: 'Bash', count: 6 }
    })
  };
  const now = Date.parse('2026-04-28T11:11:00Z');
  const result = analyzeHealth(sub, now, FULL_CONFIG);
  assert.strictEqual(result.status, 'critical');
  assert.strictEqual(result.worstSeverity, 'critical');
  assert.strictEqual(result.signals.length, 2);
});

test('analyzeHealth returns ok when all detectors negative', () => {
  const sub = {
    isRunning: true,
    startTime: '2026-04-28T11:00:00Z',
    diagnostics: emptyDiagnostics({ lastActivity: new Date().toISOString() })
  };
  const result = analyzeHealth(sub, Date.now(), FULL_CONFIG);
  assert.strictEqual(result.status, 'ok');
  assert.strictEqual(result.worstSeverity, null);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
