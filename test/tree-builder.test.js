const assert = require('assert');
const logger = require('../src/utils/logger');
logger.init(false);

const { collectAgentToolUses } = require('../src/parsers/tree-builder');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}: ${e.message}`);
  }
}

console.log('\n=== parsers/tree-builder ===');

test('collectAgentToolUses extracts Agent tool_use blocks', () => {
  const entries = [
    {
      type: 'assistant',
      timestamp: '2026-04-22T10:00:00Z',
      message: {
        content: [
          { type: 'text', text: 'working' },
          { type: 'tool_use', id: 'toolu_abc', name: 'Agent', input: { description: 'Explore auth', subagent_type: 'Explore' } },
          { type: 'tool_use', id: 'toolu_xyz', name: 'Read', input: { file_path: '/x' } },
        ],
      },
    },
    {
      type: 'assistant',
      timestamp: '2026-04-22T10:01:00Z',
      message: {
        content: [
          { type: 'tool_use', id: 'toolu_def', name: 'Agent', input: { description: 'Review code', subagent_type: 'code-reviewer' } },
        ],
      },
    },
  ];

  const map = collectAgentToolUses(entries);
  assert.strictEqual(map.size, 2);
  assert.strictEqual(map.get('toolu_abc').description, 'Explore auth');
  assert.strictEqual(map.get('toolu_abc').subagentType, 'Explore');
  assert.strictEqual(map.get('toolu_abc').timestamp, '2026-04-22T10:00:00Z');
  assert.strictEqual(map.get('toolu_def').description, 'Review code');
  assert.strictEqual(map.get('toolu_xyz'), undefined);
});

test('collectAgentToolUses handles non-assistant entries', () => {
  const entries = [
    { type: 'user', message: { content: 'hi' } },
    { type: 'assistant', message: { content: null } },
    { type: 'assistant', message: {} },
  ];
  const map = collectAgentToolUses(entries);
  assert.strictEqual(map.size, 0);
});

process.on('beforeExit', () => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
});
