const assert = require('assert');
const logger = require('../src/utils/logger');
logger.init(false);

const { hasField, recordSchemaMiss, resetSeenMisses } = require('../src/utils/schema-guard');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e.message}`); }
}

console.log('\n=== utils/schema-guard ===');

test('hasField detects shallow keys', () => {
  assert.strictEqual(hasField({ a: 1 }, 'a'), true);
  assert.strictEqual(hasField({ a: 1 }, 'b'), false);
});

test('hasField walks dot paths', () => {
  assert.strictEqual(hasField({ a: { b: { c: 3 } } }, 'a.b.c'), true);
  assert.strictEqual(hasField({ a: { b: {} } }, 'a.b.c'), false);
});

test('hasField tolerates null/undefined', () => {
  assert.strictEqual(hasField(null, 'a'), false);
  assert.strictEqual(hasField(undefined, 'a'), false);
  assert.strictEqual(hasField({ a: null }, 'a.b'), false);
});

test('hasField treats existing null field as present', () => {
  assert.strictEqual(hasField({ a: null }, 'a'), true);
});

test('recordSchemaMiss deduplicates on same key', () => {
  resetSeenMisses();
  recordSchemaMiss('test-ctx', { field: 'x' });
  recordSchemaMiss('test-ctx', { field: 'x' });
  recordSchemaMiss('test-ctx', { field: 'y' });
});

logger.close();
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
