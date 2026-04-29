const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { analyzeHealth } = require('../src/parsers/health-analyzer');

const FIX = path.join(__dirname, 'fixtures', 'health');
const config = {
  stalledWarningSec: 300,
  stalledCriticalSec: 600,
  retryThresholdN: 3,
  retryWithSameErrorN: 2
};

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e.message}`); }
}

console.log('\n=== health fixture integration ===');

const NOW = Date.parse('2026-04-28T11:30:00Z');

test('internal-error fixture → critical', () => {
  const sub = JSON.parse(fs.readFileSync(path.join(FIX, 'internal-error.json'), 'utf8'));
  const r = analyzeHealth(sub, NOW, config);
  assert.strictEqual(r.status, 'critical');
  assert(r.signals.some((s) => s.type === 'internal-error'));
});

test('stalled fixture (30분 idle) → critical', () => {
  const sub = JSON.parse(fs.readFileSync(path.join(FIX, 'stalled.json'), 'utf8'));
  const r = analyzeHealth(sub, NOW, config);
  assert.strictEqual(r.status, 'critical');
  assert(r.signals.some((s) => s.type === 'stalled'));
});

test('retry-loop fixture → warning', () => {
  const sub = JSON.parse(fs.readFileSync(path.join(FIX, 'retry-loop.json'), 'utf8'));
  const NOW2 = Date.parse('2026-04-28T11:30:03Z');
  const r = analyzeHealth(sub, NOW2, config);
  assert.strictEqual(r.status, 'warning');
  assert(r.signals.some((s) => s.type === 'retry-loop'));
});

test('clean fixture → ok', () => {
  const sub = JSON.parse(fs.readFileSync(path.join(FIX, 'clean.json'), 'utf8'));
  const r = analyzeHealth(sub, NOW, config);
  assert.strictEqual(r.status, 'ok');
  assert.deepStrictEqual(r.signals, []);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
