# Agent Health Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cc-monitor에 sub-agent 병목 신호 3종(internal-error, stalled, retry-loop)을 자동 감지·진단하고 Tree 탭과 Overview 탭에 실시간 표시한다.

**Architecture:** 신규 `health-analyzer.js`가 sub-agent 객체를 입력받아 신호를 감지하고 health 객체를 반환한다. `tree-builder`가 트리 조립 후 각 노드에 health를 부착하며, `tree-panel`은 노드 prefix/색상으로 표시하고 새 `overview-health-panel`은 전체 헬스 요약을 렌더링한다.

**Tech Stack:** Node.js, blessed (neo-blessed) TUI, JSONL 파일 read-only 파싱, 자체 test runner (assert + try/catch).

**Spec:** `docs/specs/2026-04-28-agent-health-diagnostics.md`

---

## File Structure

| 파일 | 역할 | 상태 |
|---|---|---|
| `src/parsers/health-analyzer.js` | 3종 신호 감지 + analyzeHealth 통합 | 신규 |
| `references/error-patterns.md` | internal-error 화이트리스트 패턴 | 신규 |
| `src/parsers/tree-builder.js` | 트리 조립 후 노드에 health 부착 | 수정 (1줄) |
| `src/ui/tree-panel.js` | 노드 prefix/색상 + 하단 디테일 진단 | 수정 |
| `src/ui/overview-health-panel.js` | Overview 헬스 요약 패널 | 신규 |
| `src/ui/layout.js` | Overview에 health 패널 통합 | 수정 (1줄) |
| `src/config.js` | healthAnalyzer 섹션 추가 | 수정 |
| `test/health-analyzer.test.js` | health-analyzer 단위 테스트 | 신규 |
| `test/fixtures/health/internal-error.json` | fixture | 신규 |
| `test/fixtures/health/stalled.json` | fixture | 신규 |
| `test/fixtures/health/retry-loop.json` | fixture | 신규 |
| `test/fixtures/health/clean.json` | fixture | 신규 |

---

## Task 1: error-patterns 화이트리스트 생성

**Files:**
- Create: `references/error-patterns.md`

- [ ] **Step 1.1: 패턴 파일 작성**

```markdown
# Internal Error Patterns

이 파일은 health-analyzer.detectInternalError가 화이트리스트로 사용한다.
한 줄당 한 패턴. 빈 줄과 `#` 주석은 무시.

Tool result missing due to internal error
agent stopped unexpectedly
Internal server error
API Error: 500
```

- [ ] **Step 1.2: 커밋**

```bash
cd ~/.claude/monitor
git add references/error-patterns.md
git commit -m "feat(health): add internal error pattern whitelist"
```

---

## Task 2: health-analyzer 모듈 — 스켈레톤 + loadErrorPatterns

**Files:**
- Create: `src/parsers/health-analyzer.js`
- Test: `test/health-analyzer.test.js`

- [ ] **Step 2.1: 실패 테스트 작성** (`test/health-analyzer.test.js`)

```javascript
const assert = require('assert');
const path = require('path');
const { loadErrorPatterns, analyzeHealth } = require('../src/parsers/health-analyzer');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e.message}`); }
}

console.log('\n=== parsers/health-analyzer ===');

test('loadErrorPatterns reads patterns from references/error-patterns.md', () => {
  const patterns = loadErrorPatterns();
  assert(Array.isArray(patterns));
  assert(patterns.includes('Tool result missing due to internal error'));
  assert(patterns.includes('agent stopped unexpectedly'));
  // 빈 줄과 주석은 무시되어야 함
  assert(!patterns.some((p) => p.startsWith('#')));
  assert(!patterns.includes(''));
});

test('analyzeHealth returns ok status for empty subagent', () => {
  const result = analyzeHealth({ status: 'completed', entries: [] }, Date.now(), {});
  assert.strictEqual(result.status, 'ok');
  assert.deepStrictEqual(result.signals, []);
  assert.strictEqual(result.worstSeverity, null);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 2.2: 테스트 실행 — 실패 확인**

```bash
cd ~/.claude/monitor
node test/health-analyzer.test.js
```

Expected: `Cannot find module '../src/parsers/health-analyzer'`

- [ ] **Step 2.3: 최소 구현 작성** (`src/parsers/health-analyzer.js`)

```javascript
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

function analyzeHealth(subagent, now, config) {
  const signals = [];
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

module.exports = { loadErrorPatterns, analyzeHealth };
```

- [ ] **Step 2.4: 테스트 실행 — 통과 확인**

```bash
node test/health-analyzer.test.js
```

Expected: `2 passed, 0 failed`

- [ ] **Step 2.5: 커밋**

```bash
git add src/parsers/health-analyzer.js test/health-analyzer.test.js
git commit -m "feat(health): add health-analyzer skeleton with pattern loader"
```

---

## Task 3: detectInternalError 신호 감지

**Files:**
- Modify: `src/parsers/health-analyzer.js`
- Modify: `test/health-analyzer.test.js`

- [ ] **Step 3.1: 실패 테스트 추가** (test 파일에 append)

```javascript
const { detectInternalError } = require('../src/parsers/health-analyzer');

test('detectInternalError returns null for running subagent', () => {
  const sub = { status: 'running', entries: [{ timestamp: '2026-04-28T11:00:00Z' }] };
  assert.strictEqual(detectInternalError(sub), null);
});

test('detectInternalError detects toolUseResult.is_error on completed', () => {
  const sub = {
    status: 'completed',
    entries: [
      { timestamp: '2026-04-28T11:00:00Z',
        toolUseResult: { is_error: true, content: 'API Error: timeout' } }
    ]
  };
  const sig = detectInternalError(sub);
  assert.strictEqual(sig.type, 'internal-error');
  assert.strictEqual(sig.severity, 'critical');
  assert(sig.message.includes('API Error: timeout'));
});

test('detectInternalError matches whitelist pattern in last entry text', () => {
  const sub = {
    status: 'completed',
    entries: [
      { timestamp: '2026-04-28T11:00:00Z',
        content: [{ text: 'Tool result missing due to internal error' }] }
    ]
  };
  const sig = detectInternalError(sub);
  assert.strictEqual(sig.type, 'internal-error');
  assert.strictEqual(sig.severity, 'critical');
});

test('detectInternalError returns null for normal completed', () => {
  const sub = {
    status: 'completed',
    entries: [{ timestamp: '2026-04-28T11:00:00Z', content: [{ text: 'done' }] }]
  };
  assert.strictEqual(detectInternalError(sub), null);
});
```

- [ ] **Step 3.2: 테스트 실행 — 실패 확인**

```bash
node test/health-analyzer.test.js
```

Expected: 4 tests fail with `detectInternalError is not a function` or null returned.

- [ ] **Step 3.3: 구현 추가** (health-analyzer.js)

```javascript
function truncate(s, n = 80) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '...' : s;
}

function detectInternalError(subagent) {
  if (subagent.status !== 'completed') return null;
  const lastEntry = subagent.entries && subagent.entries[subagent.entries.length - 1];
  if (!lastEntry) return null;

  if (lastEntry.toolUseResult && lastEntry.toolUseResult.is_error) {
    return {
      type: 'internal-error',
      severity: 'critical',
      message: `도구 결과 실패: ${truncate(lastEntry.toolUseResult.content)}`,
      since: lastEntry.timestamp
    };
  }

  const patterns = loadErrorPatterns();
  const text = (lastEntry.content && lastEntry.content[0] && lastEntry.content[0].text) || '';
  for (const pattern of patterns) {
    if (text.includes(pattern)) {
      return {
        type: 'internal-error',
        severity: 'critical',
        message: `Anthropic 내부 에러: "${pattern}"`,
        since: lastEntry.timestamp
      };
    }
  }
  return null;
}

module.exports = { loadErrorPatterns, analyzeHealth, detectInternalError };
```

- [ ] **Step 3.4: 테스트 실행 — 통과 확인**

```bash
node test/health-analyzer.test.js
```

Expected: 6 passed (2 기존 + 4 신규).

- [ ] **Step 3.5: 커밋**

```bash
git add src/parsers/health-analyzer.js test/health-analyzer.test.js
git commit -m "feat(health): detect internal-error signal from last entry"
```

---

## Task 4: detectStalled 신호 감지

**Files:**
- Modify: `src/parsers/health-analyzer.js`
- Modify: `test/health-analyzer.test.js`

- [ ] **Step 4.1: 실패 테스트 추가**

```javascript
const { detectStalled } = require('../src/parsers/health-analyzer');

const STALLED_CONFIG = { stalledWarningSec: 300, stalledCriticalSec: 600 };

test('detectStalled returns null for completed subagent', () => {
  const sub = { status: 'completed', entries: [{ timestamp: '2026-04-28T11:00:00Z' }] };
  const now = new Date('2026-04-28T11:30:00Z').getTime();
  assert.strictEqual(detectStalled(sub, now, STALLED_CONFIG), null);
});

test('detectStalled returns null when running but recent', () => {
  const sub = { status: 'running', entries: [{ timestamp: '2026-04-28T11:00:00Z' }] };
  const now = new Date('2026-04-28T11:01:00Z').getTime();
  assert.strictEqual(detectStalled(sub, now, STALLED_CONFIG), null);
});

test('detectStalled returns warning for 6분 idle', () => {
  const sub = { status: 'running', entries: [{ timestamp: '2026-04-28T11:00:00Z', name: 'Bash' }] };
  const now = new Date('2026-04-28T11:06:00Z').getTime();
  const sig = detectStalled(sub, now, STALLED_CONFIG);
  assert.strictEqual(sig.type, 'stalled');
  assert.strictEqual(sig.severity, 'warning');
  assert(sig.message.includes('Bash'));
});

test('detectStalled returns critical for 11분 idle', () => {
  const sub = { status: 'running', entries: [{ timestamp: '2026-04-28T11:00:00Z' }] };
  const now = new Date('2026-04-28T11:11:00Z').getTime();
  const sig = detectStalled(sub, now, STALLED_CONFIG);
  assert.strictEqual(sig.severity, 'critical');
});
```

- [ ] **Step 4.2: 테스트 실행 — 실패 확인**

```bash
node test/health-analyzer.test.js
```

Expected: 4 tests fail.

- [ ] **Step 4.3: 구현 추가**

```javascript
function formatDuration(ms) {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function detectStalled(subagent, now, config) {
  if (subagent.status !== 'running') return null;
  const lastEntry = subagent.entries && subagent.entries[subagent.entries.length - 1];
  if (!lastEntry) return null;

  const idleMs = now - new Date(lastEntry.timestamp).getTime();
  const toolName = lastEntry.name || '?';

  if (idleMs >= config.stalledCriticalSec * 1000) {
    return {
      type: 'stalled',
      severity: 'critical',
      message: `${formatDuration(idleMs)}간 출력 없음 (마지막 도구: ${toolName})`,
      since: lastEntry.timestamp
    };
  }
  if (idleMs >= config.stalledWarningSec * 1000) {
    return {
      type: 'stalled',
      severity: 'warning',
      message: `${formatDuration(idleMs)}간 출력 없음 (마지막 도구: ${toolName})`,
      since: lastEntry.timestamp
    };
  }
  return null;
}

module.exports = { loadErrorPatterns, analyzeHealth, detectInternalError, detectStalled };
```

- [ ] **Step 4.4: 테스트 실행 — 통과 확인**

```bash
node test/health-analyzer.test.js
```

Expected: 10 passed.

- [ ] **Step 4.5: 커밋**

```bash
git add src/parsers/health-analyzer.js test/health-analyzer.test.js
git commit -m "feat(health): detect stalled signal with warning/critical thresholds"
```

---

## Task 5: detectRetryLoop 신호 감지

**Files:**
- Modify: `src/parsers/health-analyzer.js`
- Modify: `test/health-analyzer.test.js`

- [ ] **Step 5.1: 실패 테스트 추가**

```javascript
const { detectRetryLoop } = require('../src/parsers/health-analyzer');

const RETRY_CONFIG = { retryThresholdN: 3, retryWithSameErrorN: 2 };

function bashEntry(cmd, opts = {}) {
  return {
    type: 'tool_use', name: 'Bash', timestamp: opts.ts || '2026-04-28T11:00:00Z',
    input: { command: cmd },
    toolUseResult: opts.result
  };
}

test('detectRetryLoop returns null for fewer than N entries', () => {
  const sub = { entries: [bashEntry('ls'), bashEntry('ls')] };
  assert.strictEqual(detectRetryLoop(sub, RETRY_CONFIG), null);
});

test('detectRetryLoop detects 3 same Bash commands', () => {
  const sub = { entries: [bashEntry('ls'), bashEntry('ls'), bashEntry('ls')] };
  const sig = detectRetryLoop(sub, RETRY_CONFIG);
  assert.strictEqual(sig.type, 'retry-loop');
  assert.strictEqual(sig.severity, 'warning');
  assert(sig.message.includes('3회'));
});

test('detectRetryLoop returns null when commands differ', () => {
  const sub = { entries: [bashEntry('ls'), bashEntry('pwd'), bashEntry('ls')] };
  assert.strictEqual(detectRetryLoop(sub, RETRY_CONFIG), null);
});

test('detectRetryLoop detects 2 same calls with same error', () => {
  const errResult = { is_error: true, content: 'permission denied' };
  const sub = {
    entries: [
      bashEntry('rm -rf x', { result: errResult }),
      bashEntry('rm -rf x', { result: errResult })
    ]
  };
  const sig = detectRetryLoop(sub, RETRY_CONFIG);
  assert.strictEqual(sig.type, 'retry-loop');
  assert(sig.message.includes('동일 에러'));
});

test('detectRetryLoop ignores 2 same calls without same error', () => {
  const sub = { entries: [bashEntry('ls'), bashEntry('ls')] };
  assert.strictEqual(detectRetryLoop(sub, RETRY_CONFIG), null);
});
```

- [ ] **Step 5.2: 테스트 실행 — 실패 확인**

```bash
node test/health-analyzer.test.js
```

Expected: 5 tests fail.

- [ ] **Step 5.3: 구현 추가**

```javascript
function toolKey(entry) {
  switch (entry.name) {
    case 'Edit':
    case 'Write':
    case 'Read':
      return `${entry.name}:${(entry.input && entry.input.file_path) || ''}`;
    case 'Bash':
      return `Bash:${((entry.input && entry.input.command) || '').slice(0, 100)}`;
    default:
      return `${entry.name}:${JSON.stringify(entry.input || {}).slice(0, 100)}`;
  }
}

function makeRetrySignal(slice, count, withError) {
  return {
    type: 'retry-loop',
    severity: 'warning',
    message: `같은 ${slice[0].name} 호출 ${count}회 연속${withError ? ' + 동일 에러' : ''}`,
    since: slice[0].timestamp,
    evidence: { tool: slice[0].name, input: toolKey(slice[0]), withError: !!withError }
  };
}

function detectRetryLoop(subagent, config) {
  const N = config.retryThresholdN;
  const M = config.retryWithSameErrorN;
  const toolUses = (subagent.entries || []).filter((e) => e.type === 'tool_use');
  if (toolUses.length === 0) return null;

  function isLoopOfLength(len) {
    const slice = toolUses.slice(-len);
    if (slice.length < len) return false;
    const keys = slice.map(toolKey);
    return keys.every((k) => k === keys[0]);
  }

  if (isLoopOfLength(N)) {
    return makeRetrySignal(toolUses.slice(-N), N, false);
  }
  if (isLoopOfLength(M)) {
    const last = toolUses.slice(-M);
    const allErrored = last.every((tu) => tu.toolUseResult && tu.toolUseResult.is_error === true);
    const sameErrorText = last.every((tu, i, a) =>
      i === 0 || (tu.toolUseResult && a[0].toolUseResult &&
                   tu.toolUseResult.content === a[0].toolUseResult.content));
    if (allErrored && sameErrorText) {
      return makeRetrySignal(last, M, true);
    }
  }
  return null;
}

module.exports = { loadErrorPatterns, analyzeHealth, detectInternalError, detectStalled, detectRetryLoop };
```

- [ ] **Step 5.4: 테스트 실행 — 통과 확인**

```bash
node test/health-analyzer.test.js
```

Expected: 15 passed.

- [ ] **Step 5.5: 커밋**

```bash
git add src/parsers/health-analyzer.js test/health-analyzer.test.js
git commit -m "feat(health): detect retry-loop signal (N consecutive same tool+input)"
```

---

## Task 6: analyzeHealth 통합 + 우선순위

**Files:**
- Modify: `src/parsers/health-analyzer.js`
- Modify: `test/health-analyzer.test.js`

- [ ] **Step 6.1: 실패 테스트 추가**

```javascript
test('analyzeHealth aggregates signals from all 3 detectors', () => {
  const sub = {
    status: 'running',
    entries: [
      { timestamp: '2026-04-28T11:00:00Z', type: 'tool_use', name: 'Bash',
        input: { command: 'ls' } },
      { timestamp: '2026-04-28T11:00:01Z', type: 'tool_use', name: 'Bash',
        input: { command: 'ls' } },
      { timestamp: '2026-04-28T11:00:02Z', type: 'tool_use', name: 'Bash',
        input: { command: 'ls' } }
    ]
  };
  const now = new Date('2026-04-28T11:11:00Z').getTime();
  const config = { stalledWarningSec: 300, stalledCriticalSec: 600,
                   retryThresholdN: 3, retryWithSameErrorN: 2 };
  const result = analyzeHealth(sub, now, config);
  assert.strictEqual(result.status, 'critical');  // stalled critical 우선
  assert.strictEqual(result.worstSeverity, 'critical');
  assert(result.signals.length >= 2);  // stalled + retry-loop
});

test('analyzeHealth returns ok when no signals', () => {
  const sub = { status: 'running', entries: [{ timestamp: new Date().toISOString() }] };
  const config = { stalledWarningSec: 300, stalledCriticalSec: 600,
                   retryThresholdN: 3, retryWithSameErrorN: 2 };
  const result = analyzeHealth(sub, Date.now(), config);
  assert.strictEqual(result.status, 'ok');
  assert.strictEqual(result.worstSeverity, null);
});
```

- [ ] **Step 6.2: 테스트 실행 — 실패 확인**

```bash
node test/health-analyzer.test.js
```

Expected: 첫 번째 추가 테스트 실패 (analyzeHealth가 빈 signals만 반환).

- [ ] **Step 6.3: analyzeHealth 통합 구현**

```javascript
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
```

- [ ] **Step 6.4: 테스트 실행 — 통과 확인**

```bash
node test/health-analyzer.test.js
```

Expected: 17 passed.

- [ ] **Step 6.5: 커밋**

```bash
git add src/parsers/health-analyzer.js test/health-analyzer.test.js
git commit -m "feat(health): aggregate 3 signals into unified health object"
```

---

## Task 7: config.js에 healthAnalyzer 섹션 추가

**Files:**
- Modify: `src/config.js`

- [ ] **Step 7.1: 현재 config.js 구조 확인**

```bash
cat src/config.js | head -40
```

- [ ] **Step 7.2: healthAnalyzer 섹션 추가** (config.js의 export 객체에)

```javascript
healthAnalyzer: {
  stalledWarningSec: 300,
  stalledCriticalSec: 600,
  retryThresholdN: 3,
  retryWithSameErrorN: 2,
  topIssuesCount: 3
}
```

- [ ] **Step 7.3: 커밋**

```bash
git add src/config.js
git commit -m "feat(health): add healthAnalyzer config section"
```

---

## Task 8: tree-builder에 health 부착 (cc-monitor 데이터 모델 정정 반영, 2026-04-28)

> **데이터 모델 갭 정정**: 실제 cc-monitor에서 `parseSubagents()`는 `entries`를 결과로 노출하지 않고, `tree-builder`는 sub-agent를 평면 필드로 분해해서 노드에 저장한다. 노드의 `kind`는 `'agent'`(spec의 'subagent' 가정 오류). 따라서 다음 두 가지 변경이 필요:
> 1. **`tree-builder.js`의 agent 노드 생성 시점에 `_subagent` 필드로 원본 sub-agent 객체 참조를 보존** (메모리 비용 미미, 객체 참조만)
> 2. **`health-analyzer.js`는 `parseSubagents` 결과 객체 모양 그대로 입력받도록 호출** (entries 가정 제거 — spec 5.0 데이터 모델 기반으로 health-analyzer를 함께 정정해야 함, 별도 task)
>
> 본 Task 8은 1번만 수행. health-analyzer 정정은 새 task로 분리(아래 "Task 8a" 참조).

**Files:**
- Modify: `src/parsers/tree-builder.js`
- Test: `test/tree-builder.test.js` (기존 테스트 + 추가)

- [ ] **Step 8.1: 실패 테스트 추가** (tree-builder.test.js에 append)

```javascript
const { buildTree } = require('../src/parsers/tree-builder');

test('buildTree attaches _subagent ref + health object to each agent node', () => {
  const subagents = [{
    id: 'sub1',
    type: 'qa-manager',
    isRunning: false,                            // 실제 모델: isRunning boolean
    startTime: '2026-04-28T11:00:00Z',
    endTime: '2026-04-28T11:01:00Z',
    elapsedMs: 60000,
    parentToolUseID: null,
    tools: {},
    diagnostics: {
      errors: ['Tool result missing due to internal error'],
      deniedCount: 0,
      lastActivity: '2026-04-28T11:01:00Z',
      repeatPattern: null
    }
  }];
  const tree = buildTree({ sessionId: 'x', mainEntries: [], subagents, mainEntriesBySubagent: new Map() });
  const node = tree.byId.get('sub1');
  assert(node, 'sub1 노드가 트리에 있어야 함');
  assert(node._subagent, '_subagent 원본 참조가 부착되어야 함');
  assert(node.health, 'health 객체가 부착되어야 함');
  assert.strictEqual(node.health.status, 'critical');
  assert(node.health.signals.some((s) => s.type === 'internal-error'));
});
```

- [ ] **Step 8.2: 테스트 실행 — 실패 확인**

```bash
node test/tree-builder.test.js
```

Expected: `node._subagent is undefined` 또는 `node.health is undefined` 실패.

- [ ] **Step 8.3: tree-builder.js 수정**

(1) `buildTree` 안의 `agentNodes = subagents.map(sa => { ... })` 블록 내부, `makeNode('agent', sa.id, {...})` 호출 직후 `byId.set(node.id, node);` 위에 `node._subagent = sa;` 추가.

(2) 파일 상단에 import 추가:
```javascript
const { analyzeHealth } = require('./health-analyzer');
const config = require('../config');
```

(3) `buildTree` 함수의 return 직전(`return { root, byId, flatten };` 바로 위)에 health 부착 루프 추가:
```javascript
const now = Date.now();
for (const node of agentNodes) {
  node.health = analyzeHealth(node._subagent, now, config.healthAnalyzer);
}
```

> 주의: spec 5.0 데이터 모델 정정에 따라 `analyzeHealth(subagent, ...)`는 **`parseSubagents` 결과 객체 모양**을 입력으로 받아야 한다. 현재 health-analyzer는 entries 기반이라 그대로는 동작 안 함 → **Task 8a (health-analyzer 정정)를 먼저 완료해야 이 Task 8 테스트가 통과**한다.

- [ ] **Step 8.4: 테스트 실행 — 통과 확인** (Task 8a 완료 후에)

```bash
node test/tree-builder.test.js
```

Expected: 기존 테스트 + 신규 테스트 모두 통과.

- [ ] **Step 8.5: 커밋**

```bash
git add src/parsers/tree-builder.js test/tree-builder.test.js
git commit -m "feat(health): attach _subagent ref + health to agent nodes in tree"
```

---

## Task 8a (NEW, 2026-04-28 추가): health-analyzer를 cc-monitor 데이터 모델로 정정

**Files:**
- Modify: `src/parsers/health-analyzer.js`
- Modify: `test/health-analyzer.test.js`

**Why**: 기존 health-analyzer는 entries 기반 가정으로 작성되었으나, cc-monitor의 `parseSubagents` 결과는 entries를 노출하지 않고 `diagnostics.errors`/`diagnostics.lastActivity`/`diagnostics.repeatPattern`을 미리 계산해둔다. health-analyzer를 어댑터 형태로 재작성한다.

- [ ] **Step 8a.1: detectInternalError 정정** — `subagent.diagnostics.errors` 배열 + 패턴 화이트리스트 매칭 기반.

```javascript
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
  // 화이트리스트 미매칭이지만 errors가 있으면 generic critical
  return {
    type: 'internal-error',
    severity: 'critical',
    message: `에러 ${errors.length}건: ${truncate(errors[0])}`,
    since: subagent.endTime || subagent.startTime
  };
}
```

- [ ] **Step 8a.2: detectStalled 정정** — `subagent.isRunning` + `diagnostics.lastActivity`.

```javascript
function detectStalled(subagent, now, config) {
  if (!subagent.isRunning) return null;
  const lastActivity = (subagent.diagnostics && subagent.diagnostics.lastActivity) || subagent.startTime;
  if (!lastActivity) return null;
  const idleMs = now - new Date(lastActivity).getTime();
  if (idleMs >= config.stalledCriticalSec * 1000) {
    return { type: 'stalled', severity: 'critical',
             message: `${formatDuration(idleMs)}간 출력 없음`, since: lastActivity };
  }
  if (idleMs >= config.stalledWarningSec * 1000) {
    return { type: 'stalled', severity: 'warning',
             message: `${formatDuration(idleMs)}간 출력 없음`, since: lastActivity };
  }
  return null;
}
```

- [ ] **Step 8a.3: detectRetryLoop 정정** — `subagent.diagnostics.repeatPattern` 직접 사용 (subagent-parser가 이미 감지함).

```javascript
function detectRetryLoop(subagent, config) {
  const rp = subagent.diagnostics && subagent.diagnostics.repeatPattern;
  if (!rp || rp.count < (config.retryThresholdN || 3)) return null;
  return {
    type: 'retry-loop',
    severity: 'warning',
    message: `같은 ${rp.tool} 호출 ${rp.count}회 연속`,
    since: subagent.diagnostics.lastActivity || subagent.startTime,
    evidence: { tool: rp.tool, count: rp.count }
  };
}
```

- [ ] **Step 8a.4: 테스트 fixture 정정** — `parseSubagents` 결과 모양으로 모든 fixture 재작성. `entries` 필드 제거, `isRunning`/`diagnostics` 사용.

```javascript
// internal-error fixture
const sub = {
  isRunning: false,
  startTime: '2026-04-28T11:00:00Z',
  endTime: '2026-04-28T11:01:00Z',
  diagnostics: {
    errors: ['Tool result missing due to internal error'],
    deniedCount: 0, lastActivity: '2026-04-28T11:01:00Z', repeatPattern: null
  }
};

// stalled fixture
const sub = {
  isRunning: true,
  startTime: '2026-04-28T11:00:00Z',
  diagnostics: { errors: [], deniedCount: 0,
                 lastActivity: '2026-04-28T11:00:00Z', repeatPattern: null }
};

// retry-loop fixture
const sub = {
  isRunning: true,
  diagnostics: { errors: [], deniedCount: 0,
                 lastActivity: '...', repeatPattern: { tool: 'Bash', count: 6 } }
};
```

- [ ] **Step 8a.5: 테스트 실행 — 모두 통과 확인**

```bash
node test/health-analyzer.test.js
```

- [ ] **Step 8a.6: 커밋**

```bash
git add src/parsers/health-analyzer.js test/health-analyzer.test.js
git commit -m "fix(health): adapt health-analyzer to cc-monitor parseSubagents shape"
```

---

## Task 9: tree-panel — 노드 prefix + 색상

**Files:**
- Modify: `src/ui/tree-panel.js`

- [ ] **Step 9.1: 현재 노드 렌더링 위치 확인**

```bash
grep -n "renderNode\|formatNode\|setItems" src/ui/tree-panel.js
```

- [ ] **Step 9.2: 노드 prefix 매핑 함수 추가** (tree-panel.js 상단 또는 utility 영역)

```javascript
function healthPrefix(health, status) {
  if (health && health.worstSeverity === 'critical') {
    const stalledType = health.signals.find((s) => s.type === 'stalled' && s.severity === 'critical');
    if (stalledType) return '{red-fg}⏸{/}';
    return '{red-fg}⚠{/}';
  }
  if (health && health.worstSeverity === 'warning') {
    const retry = health.signals.find((s) => s.type === 'retry-loop');
    if (retry) return '{yellow-fg}♻{/}';
    return '{yellow-fg}⏸{/}';
  }
  if (status === 'completed') return '{green-fg}✓{/}';
  if (status === 'running') return '●';
  return ' ';
}
```

- [ ] **Step 9.3: 노드 렌더링에서 prefix 적용**

기존 노드 라인 포맷:
```javascript
const line = `${indent}${prefix} ${node.label}  ${duration}  ${desc}`;
```
변경:
```javascript
const prefix = healthPrefix(node.health, node.subagent && node.subagent.status);
const line = `${indent}${prefix} ${node.label}  ${duration}  ${desc}`;
```

- [ ] **Step 9.4: cc-monitor 실행으로 시각 검증**

```bash
npm start
```

Tree 탭(5)으로 이동. 활성 세션에서 병목이 있으면 ⚠/⏸/♻이 노드에 표시되는지 확인.

- [ ] **Step 9.5: 커밋**

```bash
git add src/ui/tree-panel.js
git commit -m "feat(health): show health prefix on tree nodes"
```

---

## Task 10: tree-panel — 하단 디테일 진단 메시지

**Files:**
- Modify: `src/ui/tree-panel.js`

- [ ] **Step 10.1: 하단 디테일 패널 위치 확인**

```bash
grep -n "detail\|selected\|onSelect" src/ui/tree-panel.js
```

- [ ] **Step 10.2: 진단 메시지 포맷 함수 추가**

```javascript
function formatHealthDetail(node) {
  if (!node || !node.health) return '';
  const h = node.health;
  if (h.status === 'ok') return 'Status: {green-fg}ok{/}';
  const sigLines = h.signals.map((s) => {
    const color = s.severity === 'critical' ? 'red-fg' : 'yellow-fg';
    return `  {${color}}${s.type}{/}: ${s.message}`;
  });
  const diagnosis = diagnoseSignals(h.signals);
  return [
    `Status: {${h.worstSeverity === 'critical' ? 'red-fg' : 'yellow-fg'}}${h.status}{/}`,
    'Signals:',
    ...sigLines,
    diagnosis ? `Diagnosis: ${diagnosis}` : ''
  ].filter(Boolean).join('\n');
}

function diagnoseSignals(signals) {
  const types = signals.map((s) => s.type);
  if (types.includes('internal-error')) return 'Anthropic 내부 오류. 메인 세션에서 직접 수행 또는 재호출 권장.';
  if (types.includes('stalled')) return '출력이 멈춤. 프로세스 상태 확인 또는 인터럽트 후 재시도 권장.';
  if (types.includes('retry-loop')) return '같은 입력으로 반복 호출. 다른 접근법 시도 또는 입력 재검토 권장.';
  return null;
}
```

- [ ] **Step 10.3: 노드 선택 이벤트에서 디테일 패널 갱신**

기존 onSelect 핸들러에서:
```javascript
this.detailBox.setContent(formatHealthDetail(selectedNode) + '\n\n' + existingDetail);
```

- [ ] **Step 10.4: 시각 검증**

```bash
npm start
```

병목 있는 노드 선택 시 하단 패널에 진단 + Diagnosis 표시되는지 확인.

- [ ] **Step 10.5: 커밋**

```bash
git add src/ui/tree-panel.js
git commit -m "feat(health): show diagnosis details in tree-panel detail box"
```

---

## Task 11: overview-health-panel 신규 패널

**Files:**
- Create: `src/ui/overview-health-panel.js`

- [ ] **Step 11.1: 패널 모듈 작성**

```javascript
const blessed = require('neo-blessed');
const config = require('../config');

function createHealthPanel(parent, opts = {}) {
  const box = blessed.box({
    parent,
    label: ' ⚕ Sub-agent Health ',
    border: 'line',
    tags: true,
    style: { border: { fg: 'gray' } },
    ...opts
  });

  function render(allSubagents) {
    if (!allSubagents || allSubagents.length === 0) {
      box.setContent('  No active sub-agents');
      return;
    }
    const buckets = { ok: 0, warning: 0, critical: 0 };
    const issues = [];
    for (const s of allSubagents) {
      const h = s.health || { status: 'ok', signals: [] };
      buckets[h.status]++;
      for (const sig of h.signals) {
        issues.push({ subagent: s, signal: sig });
      }
    }
    if (buckets.warning === 0 && buckets.critical === 0) {
      box.setContent(`  {green-fg}⚕ All OK{/} (${buckets.ok} sub-agents healthy)`);
      return;
    }
    issues.sort((a, b) => severityRank(b.signal.severity) - severityRank(a.signal.severity));
    const top = issues.slice(0, config.healthAnalyzer.topIssuesCount);
    const lines = [
      `  {green-fg}✓ OK: ${buckets.ok}{/}   {red-fg}⚠ Critical: ${buckets.critical}{/}   {yellow-fg}⏸ Warning: ${buckets.warning}{/}`,
      `  Top issues:`
    ];
    for (const issue of top) {
      const color = issue.signal.severity === 'critical' ? 'red-fg' : 'yellow-fg';
      const icon = issue.signal.type === 'internal-error' ? '⚠'
                 : issue.signal.type === 'stalled' ? '⏸'
                 : '♻';
      lines.push(`    {${color}}${icon}{/} ${issue.subagent.agentType.padEnd(20)} ${issue.signal.message.slice(0, 60)}`);
    }
    box.setContent(lines.join('\n'));
  }

  function severityRank(s) { return s === 'critical' ? 2 : s === 'warning' ? 1 : 0; }

  return { box, render };
}

module.exports = { createHealthPanel };
```

- [ ] **Step 11.2: 단위 테스트 작성** (`test/overview-health-panel.test.js`)

```javascript
const assert = require('assert');
// blessed 컴포넌트는 unit test에서 setContent만 검증
const blessed = require('neo-blessed');
const screen = blessed.screen({ smartCSR: false, log: '/dev/null', dump: false });
const { createHealthPanel } = require('../src/ui/overview-health-panel');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e.message}`); }
}

console.log('\n=== ui/overview-health-panel ===');

test('renders All OK when no issues', () => {
  const panel = createHealthPanel(screen);
  panel.render([{ agentType: 'x', health: { status: 'ok', signals: [] } }]);
  assert(panel.box.getContent().includes('All OK'));
});

test('renders critical count', () => {
  const panel = createHealthPanel(screen);
  panel.render([
    { agentType: 'qa-manager',
      health: { status: 'critical', worstSeverity: 'critical',
                signals: [{ type: 'internal-error', severity: 'critical', message: 'foo' }] } }
  ]);
  const c = panel.box.getContent();
  assert(c.includes('Critical: 1'));
  assert(c.includes('qa-manager'));
});

screen.destroy();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 11.3: 테스트 실행 — 통과 확인**

```bash
node test/overview-health-panel.test.js
```

Expected: 2 passed.

- [ ] **Step 11.4: 커밋**

```bash
git add src/ui/overview-health-panel.js test/overview-health-panel.test.js
git commit -m "feat(health): add overview health panel with top issues"
```

---

## Task 12: layout.js — Overview에 health 패널 통합

**Files:**
- Modify: `src/ui/layout.js`

- [ ] **Step 12.1: 현재 Overview 패널 배치 확인**

```bash
grep -n "subagents\|recap\|cost" src/ui/layout.js
```

- [ ] **Step 12.2: subagents 패널 다음 위치에 health 패널 추가**

```javascript
const { createHealthPanel } = require('./overview-health-panel');

// Overview 탭 build 함수 안, subagents 패널 직후:
const healthPanel = createHealthPanel(overviewContainer, {
  top: subagentsBottom,
  left: 0,
  width: '100%',
  height: 6
});
panels.health = healthPanel;
```

- [ ] **Step 12.3: refresh 루틴에서 render 호출**

기존 refreshOverview 함수에:
```javascript
panels.health.render(currentSession.subagents);
```

- [ ] **Step 12.4: cc-monitor 실행으로 시각 검증**

```bash
npm start
```

Overview 탭(1)에서 Sub-agent Health 패널이 Subagents 다음에 나타나는지 확인. 실제 세션에 병목이 없으면 "All OK"로 한 줄 표시.

- [ ] **Step 12.5: 커밋**

```bash
git add src/ui/layout.js
git commit -m "feat(health): integrate health panel into Overview tab"
```

---

## Task 13: 통합 테스트 — fixture 기반 end-to-end

**Files:**
- Create: `test/fixtures/health/internal-error.json`
- Create: `test/fixtures/health/stalled.json`
- Create: `test/fixtures/health/retry-loop.json`
- Create: `test/fixtures/health/clean.json`

- [ ] **Step 13.1: fixture 4종 작성**

`test/fixtures/health/internal-error.json`:
```json
{
  "id": "fixture-internal-error",
  "agentType": "qa-manager",
  "status": "completed",
  "entries": [
    { "timestamp": "2026-04-28T11:23:48Z",
      "toolUseResult": { "is_error": true, "content": "Tool result missing due to internal error" } }
  ]
}
```

`test/fixtures/health/stalled.json`:
```json
{
  "id": "fixture-stalled",
  "agentType": "coder",
  "status": "running",
  "entries": [
    { "timestamp": "2026-04-28T11:00:00Z", "type": "tool_use", "name": "Bash",
      "input": { "command": "long-running-task" } }
  ]
}
```

`test/fixtures/health/retry-loop.json`:
```json
{
  "id": "fixture-retry-loop",
  "agentType": "researcher",
  "status": "running",
  "entries": [
    { "timestamp": "2026-04-28T11:30:00Z", "type": "tool_use", "name": "Grep",
      "input": { "pattern": "foo" } },
    { "timestamp": "2026-04-28T11:30:01Z", "type": "tool_use", "name": "Grep",
      "input": { "pattern": "foo" } },
    { "timestamp": "2026-04-28T11:30:02Z", "type": "tool_use", "name": "Grep",
      "input": { "pattern": "foo" } }
  ]
}
```

`test/fixtures/health/clean.json`:
```json
{
  "id": "fixture-clean",
  "agentType": "product-owner",
  "status": "completed",
  "entries": [
    { "timestamp": "2026-04-28T11:30:00Z", "content": [{ "text": "PRD 작성 완료" }] }
  ]
}
```

- [ ] **Step 13.2: fixture 통합 테스트 작성** (`test/health-fixtures.test.js`)

```javascript
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { analyzeHealth } = require('../src/parsers/health-analyzer');

const FIX = path.join(__dirname, 'fixtures', 'health');
const config = { stalledWarningSec: 300, stalledCriticalSec: 600,
                 retryThresholdN: 3, retryWithSameErrorN: 2 };

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e.message}`); }
}

console.log('\n=== health fixture integration ===');

const NOW = new Date('2026-04-28T11:30:00Z').getTime();

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
  const NOW2 = new Date('2026-04-28T11:30:03Z').getTime();  // stalled 회피
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
```

- [ ] **Step 13.3: 테스트 실행 — 통과 확인**

```bash
node test/health-fixtures.test.js
```

Expected: 4 passed.

- [ ] **Step 13.4: 커밋**

```bash
git add test/fixtures/health/ test/health-fixtures.test.js
git commit -m "test(health): add fixture-based integration tests for 3 signals"
```

---

## Task 14: 최종 검증 — 실제 세션에서 시각 확인

- [ ] **Step 14.1: 모든 단위 테스트 실행**

```bash
node test/health-analyzer.test.js
node test/health-fixtures.test.js
node test/tree-builder.test.js
node test/overview-health-panel.test.js
```

Expected: 모두 0 failed.

- [ ] **Step 14.2: cc-monitor 실행 + Tree 탭 확인**

```bash
npm start
```

수동 검증 항목:
- Overview 탭: `Sub-agent Health` 패널이 Subagents 다음에 표시 (active 세션이 있을 때)
- 현재 활성 세션이 모두 정상이면 `⚕ All OK` 한 줄
- Tree 탭: sub-agent 노드의 prefix가 ✓/●/⚠/⏸/♻ 중 하나
- 노드 선택 시 하단에 Status/Signals/Diagnosis 표시

- [ ] **Step 14.3: README 업데이트** — 새 기능 1줄 안내

`README.md`의 Tab 1 섹션에 추가:
```
| **Sub-agent Health** | Per-session sub-agent diagnostics: internal-error / stalled / retry-loop signals |
```

- [ ] **Step 14.4: 최종 커밋**

```bash
git add README.md
git commit -m "docs(health): document sub-agent health panel in README"
```

---

## Self-Review Checklist (작성자 확인)

**1. Spec coverage**:
- ✅ 신호 3종 모두 task로 분해 (Task 3/4/5)
- ✅ analyzeHealth 통합 (Task 6)
- ✅ tree-builder 부착 (Task 8)
- ✅ tree-panel 확장 (Task 9/10)
- ✅ overview-health-panel 신규 (Task 11/12)
- ✅ fixture 4종 (Task 13)
- ✅ config 노출 (Task 7)

**2. Placeholder scan**: 없음.

**3. Type consistency**:
- `analyzeHealth(subagent, now, config)` 시그니처가 Task 6, 8, 11에서 일관
- health 객체 형태 `{ status, signals, worstSeverity }` 일관
- `detectInternalError(subagent)`, `detectStalled(subagent, now, config)`, `detectRetryLoop(subagent, config)` 시그니처 일관

**4. Ambiguity check**: spec 5.4의 retry-loop N=2+동일 에러 로직이 Task 5.3 구현에 정확히 반영됨.
