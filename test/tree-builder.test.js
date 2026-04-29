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

const { buildTree } = require('../src/parsers/tree-builder');

test('buildTree links subagent via parentToolUseID', () => {
  const mainEntries = [
    { type: 'assistant', timestamp: '2026-04-22T10:00:00Z', message: {
      content: [
        { type: 'tool_use', id: 'tu_A', name: 'Agent', input: { description: 'A desc', subagent_type: 'Explore' } },
        { type: 'tool_use', id: 'tu_B', name: 'Agent', input: { description: 'B desc', subagent_type: 'code-reviewer' } },
      ],
    }},
  ];
  const subagents = [
    { id: 'a1', type: 'Explore', description: 'A desc', parentToolUseID: 'tu_A',
      isRunning: false, startTime: '2026-04-22T10:00:01Z', endTime: '2026-04-22T10:00:30Z',
      elapsedMs: 29000, tokensIn: 100, tokensOut: 50, tools: { Read: 3 },
      diagnostics: { errors: [], deniedCount: 0, lastActivity: '', lastActivityText: '', repeatPattern: null }, model: 'sonnet' },
    { id: 'a2', type: 'code-reviewer', description: 'B desc', parentToolUseID: 'tu_B',
      isRunning: true, startTime: '2026-04-22T10:01:00Z', endTime: null,
      elapsedMs: 60000, tokensIn: 200, tokensOut: 80, tools: { Grep: 5 },
      diagnostics: { errors: [], deniedCount: 0, lastActivity: '', lastActivityText: '', repeatPattern: null }, model: 'haiku' },
  ];
  const mainEntriesBySubagent = new Map();

  const tree = buildTree({ sessionId: 'SESS', mainEntries, subagents, mainEntriesBySubagent });
  assert.strictEqual(tree.root.id, 'SESS');
  assert.strictEqual(tree.root.kind, 'session');
  assert.strictEqual(tree.root.children.length, 2);
  assert.strictEqual(tree.root.children[0].id, 'a1');
  assert.strictEqual(tree.root.children[0].depth, 1);
  assert.strictEqual(tree.root.children[1].id, 'a2');
  assert.strictEqual(tree.byId.get('a1').parentId, 'SESS');
  assert.strictEqual(tree.flatten.length, 3);
  assert.strictEqual(tree.flatten[0].kind, 'session');
  assert.strictEqual(tree.flatten[1].id, 'a1');
});

test('buildTree attaches orphan subagents to root', () => {
  const mainEntries = [];
  const subagents = [
    { id: 'orph', type: 'Explore', description: 'x', parentToolUseID: 'tu_MISSING',
      isRunning: false, startTime: '2026-04-22T10:00:00Z', endTime: '2026-04-22T10:00:30Z',
      elapsedMs: 30000, tokensIn: 0, tokensOut: 0, tools: {},
      diagnostics: { errors: [], deniedCount: 0, lastActivity: '', lastActivityText: '', repeatPattern: null }, model: null },
  ];
  const tree = buildTree({ sessionId: 'SESS', mainEntries, subagents, mainEntriesBySubagent: new Map() });
  assert.strictEqual(tree.root.children.length, 1);
  assert.strictEqual(tree.root.children[0].id, 'orph');
  assert.strictEqual(tree.root.children[0].parentId, 'SESS');
});

test('buildTree nests subagent spawned by another subagent', () => {
  const mainEntries = [
    { type: 'assistant', timestamp: '2026-04-22T10:00:00Z', message: {
      content: [
        { type: 'tool_use', id: 'tu_parent', name: 'Agent', input: { description: 'parent', subagent_type: 'feature-dev' } },
      ],
    }},
  ];
  const parentAgentEntries = [
    { type: 'assistant', timestamp: '2026-04-22T10:00:10Z', message: {
      content: [
        { type: 'tool_use', id: 'tu_child', name: 'Agent', input: { description: 'child', subagent_type: 'Explore' } },
      ],
    }},
  ];
  const subagents = [
    { id: 'par', type: 'feature-dev', description: 'parent', parentToolUseID: 'tu_parent',
      isRunning: false, startTime: '2026-04-22T10:00:01Z', endTime: '2026-04-22T10:02:00Z',
      elapsedMs: 120000, tokensIn: 500, tokensOut: 200, tools: { Read: 10 },
      diagnostics: { errors: [], deniedCount: 0, lastActivity: '', lastActivityText: '', repeatPattern: null }, model: 'opus' },
    { id: 'chi', type: 'Explore', description: 'child', parentToolUseID: 'tu_child',
      isRunning: false, startTime: '2026-04-22T10:00:15Z', endTime: '2026-04-22T10:00:45Z',
      elapsedMs: 30000, tokensIn: 50, tokensOut: 30, tools: { Grep: 3 },
      diagnostics: { errors: [], deniedCount: 0, lastActivity: '', lastActivityText: '', repeatPattern: null }, model: 'sonnet' },
  ];
  const mainEntriesBySubagent = new Map([['par', parentAgentEntries]]);
  const tree = buildTree({ sessionId: 'SESS', mainEntries, subagents, mainEntriesBySubagent });

  assert.strictEqual(tree.root.children.length, 1);
  assert.strictEqual(tree.root.children[0].id, 'par');
  assert.strictEqual(tree.root.children[0].children.length, 1);
  assert.strictEqual(tree.root.children[0].children[0].id, 'chi');
  assert.strictEqual(tree.root.children[0].children[0].depth, 2);
  assert.strictEqual(tree.flatten.length, 3);
  assert.strictEqual(tree.flatten[2].id, 'chi');
});

test('buildTree attaches _subagent ref + health object to each agent node', () => {
  const { buildTree } = require('../src/parsers/tree-builder');
  const subagents = [{
    id: 'sub1',
    type: 'qa-manager',
    isRunning: false,
    startTime: '2026-04-28T11:00:00Z',
    endTime: '2026-04-28T11:01:00Z',
    elapsedMs: 60000,
    parentToolUseID: null,
    tools: {},
    diagnostics: {
      errors: ['Tool result missing due to internal error'],
      deniedCount: 0,
      lastActivity: '2026-04-28T11:01:00Z',
      lastActivityText: '',
      repeatPattern: null
    }
  }];
  const tree = buildTree({ sessionId: 'x', mainEntries: [], subagents, mainEntriesBySubagent: new Map() });
  const node = tree.byId.get('sub1');
  assert(node, 'sub1 노드가 트리에 있어야 함');
  assert(node._subagent, '_subagent 원본 참조가 부착되어야 함');
  assert.strictEqual(node._subagent.id, 'sub1');
  assert(node.health, 'health 객체가 부착되어야 함');
  assert.strictEqual(node.health.status, 'critical');
  assert(node.health.signals.some((s) => s.type === 'internal-error'));
});

process.on('beforeExit', () => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
});
