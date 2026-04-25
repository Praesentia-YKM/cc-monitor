const assert = require('assert');
const logger = require('../src/utils/logger');
logger.init(false);

const { getProcessStartTime, verifyProcessIdentity } = require('../src/utils/process-info');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e.message}`); }
}

console.log('\n=== utils/process-info ===');

test('getProcessStartTime returns null for invalid pid', () => {
  assert.strictEqual(getProcessStartTime(null), null);
  assert.strictEqual(getProcessStartTime(0), null);
  assert.strictEqual(getProcessStartTime('not-a-number'), null);
});

test('getProcessStartTime returns number for current process', () => {
  const t = getProcessStartTime(process.pid);
  if (t === null) {
    console.log('    (skip: platform probe unavailable)');
    return;
  }
  assert.strictEqual(typeof t, 'number');
  assert.ok(t > 0);
  assert.ok(t <= Date.now() + 10_000);
});

test('verifyProcessIdentity returns true when startedAt missing', () => {
  assert.strictEqual(verifyProcessIdentity(process.pid, null), true);
  assert.strictEqual(verifyProcessIdentity(process.pid, undefined), true);
});

test('verifyProcessIdentity returns true when start times match', () => {
  const actual = getProcessStartTime(process.pid);
  if (actual === null) {
    console.log('    (skip: platform probe unavailable)');
    return;
  }
  assert.strictEqual(verifyProcessIdentity(process.pid, actual, 5000), true);
});

test('verifyProcessIdentity returns false when start times diverge', () => {
  const actual = getProcessStartTime(process.pid);
  if (actual === null) {
    console.log('    (skip: platform probe unavailable)');
    return;
  }
  const ancient = actual - 60 * 60 * 1000;
  assert.strictEqual(verifyProcessIdentity(process.pid, ancient, 5000), false);
});

logger.close();
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
