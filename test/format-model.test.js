const assert = require('assert');
const { shortModelName, formatModelTag, getMaxContext } = require('../src/utils/format-model');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e.message}`); }
}

console.log('\n=== utils/format-model ===');

test('getMaxContext returns 200K for standard opus model', () => {
  assert.strictEqual(getMaxContext('claude-opus-4-6'), 200000);
});

test('getMaxContext returns 1M for [1m] suffix', () => {
  assert.strictEqual(getMaxContext('claude-opus-4-7[1m]'), 1000000);
});

test('getMaxContext returns 1M for -1m suffix', () => {
  assert.strictEqual(getMaxContext('claude-opus-4-7-1m'), 1000000);
});

test('getMaxContext returns 200K for unknown model', () => {
  assert.strictEqual(getMaxContext('claude-future-model'), 200000);
});

test('getMaxContext returns 200K for null/undefined', () => {
  assert.strictEqual(getMaxContext(null), 200000);
  assert.strictEqual(getMaxContext(undefined), 200000);
});

test('shortModelName strips claude- prefix and date suffix', () => {
  assert.strictEqual(shortModelName('claude-opus-4-6'), 'opus-4-6');
  assert.strictEqual(shortModelName('claude-haiku-4-5-20251001'), 'haiku-4-5');
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
