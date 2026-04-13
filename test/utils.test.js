const assert = require('assert');
const { countTools } = require('../src/utils/tool-counter');
const { shortModelName, formatModelTag } = require('../src/utils/format-model');
const { parseTimestamp, formatDuration, formatTokenCount, formatTime } = require('../src/utils/time-format');
const { EVENT_TYPES } = require('../src/constants/event-types');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (e) {
    failed++;
    console.log(`  \u2717 ${name}: ${e.message}`);
  }
}

console.log('\n=== utils/tool-counter ===');

test('countTools accumulates tool_use blocks', () => {
  const tools = {};
  countTools(tools, [
    { type: 'tool_use', name: 'Read' },
    { type: 'tool_use', name: 'Read' },
    { type: 'tool_use', name: 'Grep' },
    { type: 'text', text: 'hello' },
  ]);
  assert.strictEqual(tools.Read, 2);
  assert.strictEqual(tools.Grep, 1);
  assert.strictEqual(Object.keys(tools).length, 2);
});

test('countTools handles null/undefined content', () => {
  const tools = {};
  countTools(tools, null);
  countTools(tools, undefined);
  countTools(tools, 'string');
  assert.strictEqual(Object.keys(tools).length, 0);
});

test('countTools skips blocks without name', () => {
  const tools = {};
  countTools(tools, [{ type: 'tool_use' }, { type: 'tool_use', name: '' }]);
  assert.strictEqual(Object.keys(tools).length, 0);
});

console.log('\n=== utils/format-model ===');

test('shortModelName strips claude- prefix and date suffix', () => {
  assert.strictEqual(shortModelName('claude-opus-4-6'), 'opus-4-6');
  assert.strictEqual(shortModelName('claude-haiku-4-5-20251001'), 'haiku-4-5');
  assert.strictEqual(shortModelName('claude-sonnet-4-6'), 'sonnet-4-6');
});

test('shortModelName handles null/empty', () => {
  assert.strictEqual(shortModelName(null), '');
  assert.strictEqual(shortModelName(''), '');
});

test('formatModelTag returns colored tags', () => {
  assert.ok(formatModelTag('claude-haiku-4-5-20251001').includes('blue-fg'));
  assert.ok(formatModelTag('claude-sonnet-4-6').includes('yellow-fg'));
  assert.ok(formatModelTag('claude-opus-4-6').includes('magenta-fg'));
});

test('formatModelTag handles unknown model', () => {
  assert.ok(formatModelTag('claude-mystery-1-0').includes('gray-fg'));
});

test('formatModelTag handles null', () => {
  assert.strictEqual(formatModelTag(null), '');
});

console.log('\n=== utils/time-format ===');

test('parseTimestamp handles ISO string', () => {
  const d = parseTimestamp('2026-04-13T10:00:00.000Z');
  assert.ok(d instanceof Date);
  assert.ok(!isNaN(d.getTime()));
});

test('parseTimestamp handles numeric timestamp', () => {
  const d = parseTimestamp(1712000000000);
  assert.ok(d instanceof Date);
});

test('formatDuration formats various ranges', () => {
  assert.strictEqual(formatDuration(0), '0s');
  assert.strictEqual(formatDuration(5000), '5s');
  assert.strictEqual(formatDuration(65000), '1m 5s');
  assert.strictEqual(formatDuration(3661000), '1h 1m');
});

test('formatTokenCount formats with K suffix', () => {
  assert.strictEqual(formatTokenCount(500), '500');
  assert.strictEqual(formatTokenCount(1500), '1.5K');
  assert.strictEqual(formatTokenCount(1500000), '1.5M');
});

console.log('\n=== constants/event-types ===');

test('EVENT_TYPES has all required keys', () => {
  const required = ['HOOK_SUCCESS', 'HOOK_CANCELLED', 'RULE_LOADED', 'MEMORY_LOADED',
    'SKILL_LISTED', 'SKILL_CALLED', 'TOOL_USE', 'USER_MSG', 'ASSISTANT_MSG'];
  for (const key of required) {
    assert.ok(EVENT_TYPES[key], `Missing key: ${key}`);
  }
});

test('EVENT_TYPES values are unique strings', () => {
  const values = Object.values(EVENT_TYPES);
  const unique = new Set(values);
  assert.strictEqual(values.length, unique.size);
  values.forEach(v => assert.strictEqual(typeof v, 'string'));
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
