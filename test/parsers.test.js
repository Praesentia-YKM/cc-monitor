const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

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

// 테스트용 임시 JSONL 생성
const tmpDir = path.join(os.tmpdir(), 'cc-monitor-test-' + Date.now());
fs.mkdirSync(tmpDir, { recursive: true });

const testJsonlPath = path.join(tmpDir, 'test.jsonl');
const testEntries = [
  { type: 'user', timestamp: '2026-04-13T10:00:00Z', message: { content: 'hello' } },
  { type: 'assistant', timestamp: '2026-04-13T10:00:05Z', message: {
    model: 'claude-opus-4-6',
    content: [
      { type: 'text', text: 'hi' },
      { type: 'tool_use', name: 'Read', input: {} },
      { type: 'tool_use', name: 'Read', input: {} },
      { type: 'tool_use', name: 'Grep', input: {} },
    ],
    usage: { input_tokens: 1000, output_tokens: 500, cache_creation_input_tokens: 200, cache_read_input_tokens: 300 },
  }},
  { type: 'user', timestamp: '2026-04-13T10:01:00Z', message: { content: 'next' } },
  { type: 'assistant', timestamp: '2026-04-13T10:01:05Z', message: {
    model: 'claude-opus-4-6',
    content: [{ type: 'text', text: 'done' }],
    usage: { input_tokens: 2000, output_tokens: 800, cache_creation_input_tokens: 100, cache_read_input_tokens: 500 },
  }},
];
fs.writeFileSync(testJsonlPath, testEntries.map(e => JSON.stringify(e)).join('\n'));

// jsonl-reader 직접 테스트 (logger init 필요)
const logger = require('../src/utils/logger');
logger.init(false);

const { readJsonlFile, readJsonlIncremental, resetCache } = require('../src/utils/jsonl-reader');

console.log('\n=== parsers/jsonl-reader ===');

test('readJsonlFile reads all entries', () => {
  const { entries, totalLines } = readJsonlFile(testJsonlPath);
  assert.strictEqual(entries.length, 4);
  assert.strictEqual(totalLines, 4);
});

test('readJsonlFile reads from offset', () => {
  const { entries } = readJsonlFile(testJsonlPath, 2);
  assert.strictEqual(entries.length, 2);
  assert.strictEqual(entries[0].type, 'user');
});

test('readJsonlFile handles missing file', () => {
  const { entries, totalLines } = readJsonlFile('/nonexistent/path.jsonl');
  assert.strictEqual(entries.length, 0);
  assert.strictEqual(totalLines, 0);
});

test('readJsonlIncremental caches and reads incrementally', () => {
  resetCache();
  const result1 = readJsonlIncremental(testJsonlPath);
  assert.strictEqual(result1.length, 4);

  // 같은 파일 재읽기 → 새 데이터 없으므로 캐시 반환
  const result2 = readJsonlIncremental(testJsonlPath);
  assert.strictEqual(result2.length, 4);

  // 파일에 줄 추가 후 증분 읽기
  const newEntry = { type: 'user', timestamp: '2026-04-13T10:02:00Z', message: { content: 'appended' } };
  fs.appendFileSync(testJsonlPath, '\n' + JSON.stringify(newEntry));
  const result3 = readJsonlIncremental(testJsonlPath);
  assert.strictEqual(result3.length, 5);
});

test('resetCache clears specific file', () => {
  resetCache(testJsonlPath);
  // 캐시 클리어 후 전체 재읽기
  const result = readJsonlIncremental(testJsonlPath);
  assert.strictEqual(result.length, 5);
});

// session-parser 테스트
const { parseSession, calcContextPercent } = require('../src/parsers/session-parser');

console.log('\n=== parsers/session-parser ===');

test('parseSession extracts model, messages, tokens, tools', () => {
  resetCache();
  const data = parseSession(testJsonlPath);
  assert.strictEqual(data.model, 'claude-opus-4-6');
  assert.ok(data.userMessages >= 2, `Expected >=2 user msgs, got ${data.userMessages}`);
  assert.strictEqual(data.assistantMessages, 2);
  assert.strictEqual(data.tokens.input, 3000);
  assert.strictEqual(data.tokens.output, 1300);
  assert.strictEqual(data.tokens.cacheWrite, 300);
  assert.strictEqual(data.tokens.cacheRead, 800);
  assert.strictEqual(data.tools.Read, 2);
  assert.strictEqual(data.tools.Grep, 1);
});

test('calcContextPercent returns valid percentage', () => {
  resetCache();
  const data = parseSession(testJsonlPath);
  const pct = calcContextPercent(data);
  assert.ok(pct >= 0 && pct <= 100, `Expected 0-100, got ${pct}`);
});

test('parseSession handles empty file gracefully', () => {
  const emptyPath = path.join(tmpDir, 'empty.jsonl');
  fs.writeFileSync(emptyPath, '');
  resetCache();
  const data = parseSession(emptyPath);
  assert.strictEqual(data.model, null);
  assert.strictEqual(data.userMessages, 0);
  assert.strictEqual(data.assistantMessages, 0);
});

// flow-parser 테스트
const { parseFlowEvents, buildFlowSummary } = require('../src/parsers/flow-parser');

console.log('\n=== parsers/flow-parser ===');

test('parseFlowEvents extracts user messages', () => {
  resetCache();
  const events = parseFlowEvents(testJsonlPath);
  const userEvents = events.filter(e => e.type === 'user');
  assert.ok(userEvents.length >= 1);
});

test('buildFlowSummary counts correctly', () => {
  resetCache();
  const events = parseFlowEvents(testJsonlPath);
  const summary = buildFlowSummary(events);
  assert.strictEqual(typeof summary.totalEvents, 'number');
  assert.strictEqual(typeof summary.userMsgs, 'number');
});

test('parseFlowEvents handles empty file', () => {
  const emptyPath = path.join(tmpDir, 'empty.jsonl');
  resetCache();
  const events = parseFlowEvents(emptyPath);
  assert.strictEqual(events.length, 0);
});

// cost-parser 테스트
const { parseCost } = require('../src/parsers/cost-parser');

console.log('\n=== parsers/cost-parser ===');

test('parseCost returns todayTotal and hasData', () => {
  const cost = parseCost();
  assert.strictEqual(typeof cost.hasData, 'boolean');
  if (cost.hasData) {
    assert.strictEqual(typeof cost.todayTotal, 'number');
    assert.ok(cost.todayTotal >= 0);
  }
});

// history-parser 테스트
const { parseSkillHistory } = require('../src/parsers/history-parser');

console.log('\n=== parsers/history-parser ===');

test('parseSkillHistory returns array', () => {
  const skills = parseSkillHistory('nonexistent-session');
  assert.ok(Array.isArray(skills));
  assert.strictEqual(skills.length, 0);
});

// subagent-parser 진단 테스트
const { extractDiagnostics, detectRepeatPattern } = require('../src/parsers/subagent-parser');

console.log('\n=== parsers/subagent-diagnostics ===');

test('extractDiagnostics detects errors from tool_result', () => {
  const entries = [
    { type: 'user', message: { content: [
      { type: 'tool_result', is_error: true, content: 'File exceeds 256KB limit' },
    ]}},
    { type: 'assistant', timestamp: '2026-04-28T11:00:00Z', message: { content: [
      { type: 'text', text: 'Searching for files...' },
      { type: 'tool_use', name: 'Grep', input: {} },
    ]}},
  ];
  const diag = extractDiagnostics(entries);
  assert.strictEqual(diag.errors.length, 1);
  assert.ok(diag.errors[0].includes('256KB'));
  assert.strictEqual(diag.lastActivity, '2026-04-28T11:00:00Z');
  assert.strictEqual(diag.lastActivityText, 'Searching for files...');
});

test('extractDiagnostics detects denied tools', () => {
  const entries = [
    { type: 'user', message: { content: [
      { type: 'tool_result', is_error: true, content: 'Permission denied by user' },
    ]}},
  ];
  const diag = extractDiagnostics(entries);
  assert.strictEqual(diag.deniedCount, 1);
});

test('detectRepeatPattern finds tool loops', () => {
  const seq = ['Read', 'Grep', 'Grep', 'Grep', 'Grep', 'Grep', 'Grep', 'Grep'];
  const result = detectRepeatPattern(seq);
  assert.ok(result);
  assert.strictEqual(result.tool, 'Grep');
  assert.strictEqual(result.count, 7);
});

test('detectRepeatPattern returns null for normal sequences', () => {
  const seq = ['Read', 'Grep', 'Glob', 'Read', 'Edit'];
  const result = detectRepeatPattern(seq);
  assert.strictEqual(result, null);
});

test('extractDiagnostics handles empty entries', () => {
  const diag = extractDiagnostics([]);
  assert.strictEqual(diag.errors.length, 0);
  assert.strictEqual(diag.deniedCount, 0);
  assert.strictEqual(diag.lastActivity, '');
  assert.strictEqual(diag.lastActivityText, '');
  assert.strictEqual(diag.repeatPattern, null);
});

// session-names 테스트
const { saveName, getName, loadNames } = require('../src/utils/session-names');

console.log('\n=== utils/session-names ===');

test('saveName handles write without crash', () => {
  // saveName이 try-catch로 보호되어 크래시하지 않아야 함
  saveName('test-session-id', 'Test Name');
  const name = getName('test-session-id');
  assert.strictEqual(name, 'Test Name');

  // 삭제
  saveName('test-session-id', '');
  assert.strictEqual(getName('test-session-id'), null);
});

// 정리
fs.rmSync(tmpDir, { recursive: true, force: true });
logger.close();

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
