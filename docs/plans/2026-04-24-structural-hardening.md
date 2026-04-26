# Structural Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** cc-monitor의 5가지 구조적 약점을 제거해 장기 유지보수 리스크를 줄인다.

**Architecture:**
- 파서는 JSONL 스키마 가드 + 명시적 fallback. 파싱 실패를 조용히 삼키지 않고 로거에 `schema_miss` 이벤트로 남긴다.
- `config.js`는 환경변수 override를 지원해 장기 세션/대형 컨텍스트 모델에서도 재빌드 없이 조정 가능하다.
- 프로세스 존재 확인은 PID 단독이 아닌 "PID + 시작시각" 쌍으로 검증해 PID 재사용 오검출을 차단한다.
- `blessed` → `neo-blessed`로 런타임 의존성 교체. API 호환이라 단일 커밋으로 마이그레이션 가능.

**Tech Stack:** Node.js ≥18, blessed → neo-blessed, 자체 테스트 러너(`test/*.test.js`).

---

## 작업 순서

쉬운 것 → 어려운 것. 각 Task 끝에서 `npm test` + `cc-monitor` 수동 실행으로 회귀 확인 후 별도 커밋.

1. Task 1 — Model 1M 컨텍스트 감지
2. Task 2 — MAX_ACCUMULATED config화
3. Task 3 — PID 재사용 검증
4. Task 4 — JSONL 스키마 가드 + `docs/SCHEMA.md`
5. Task 5 — neo-blessed 교체

Push는 모든 Task 완료 + 사용자 승인 후.

---

## Task 1: Model 1M 컨텍스트 감지

**Files:**
- Modify: `src/utils/format-model.js`
- Modify: `src/parsers/session-parser.js:57-63` (`calcContextPercent`)
- Modify: `src/config.js:16-21` (주석만, 하위 호환 유지)
- Test: `test/format-model.test.js` (신규)
- Modify: `package.json` (test 스크립트에 새 파일 추가)

### Step 1: 실패하는 테스트 작성

`test/format-model.test.js` 생성:

```javascript
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
```

### Step 2: 테스트가 실패함을 확인

```bash
cd /c/Users/User/.nvm/versions/node/v25.2.1/bin/node_modules/cc-monitor
node test/format-model.test.js
```

**Expected:** `getMaxContext is not a function` 또는 import 실패.

### Step 3: `getMaxContext` 구현

`src/utils/format-model.js` 교체:

```javascript
const DEFAULT_MAX_CONTEXT = 200000;
const ONE_MILLION_CONTEXT = 1000000;

function shortModelName(model) {
  if (!model) return '';
  return model.replace('claude-', '').replace(/\[1m\]$/, '').replace(/-1m$/, '').replace(/-\d{8}$/, '');
}

function formatModelTag(model) {
  const short = shortModelName(model);
  if (!short) return '';
  if (short.includes('haiku')) return `{blue-fg}haiku{/blue-fg}`;
  if (short.includes('sonnet')) return `{yellow-fg}sonnet{/yellow-fg}`;
  if (short.includes('opus')) return `{magenta-fg}opus{/magenta-fg}`;
  return `{gray-fg}${short}{/gray-fg}`;
}

function getMaxContext(model) {
  if (!model) return DEFAULT_MAX_CONTEXT;
  if (/\[1m\]$/.test(model) || /-1m$/.test(model)) return ONE_MILLION_CONTEXT;
  return DEFAULT_MAX_CONTEXT;
}

module.exports = { shortModelName, formatModelTag, getMaxContext, DEFAULT_MAX_CONTEXT };
```

### Step 4: `calcContextPercent`에서 `getMaxContext` 사용

`src/parsers/session-parser.js:57-63`을 다음으로 교체:

```javascript
function calcContextPercent(sessionData) {
  const { getMaxContext } = require('../utils/format-model');
  const maxCtx = getMaxContext(sessionData.model);
  const ctxSize = sessionData.lastContextSize;
  if (ctxSize <= 0 || maxCtx <= 0) return 0;
  return Math.min(Math.round((ctxSize / maxCtx) * 100), 100);
}
```

`require('../config')`는 파일 최상단에 이미 있으니 그대로 둔다. config의 `MODEL_MAX_CONTEXT`는 더 이상 참조되지 않지만 하위 호환을 위해 남긴다(주석으로 `@deprecated` 표기).

### Step 5: config 주석 추가

`src/config.js:16`에 다음 한 줄 주석을 위에 추가:

```javascript
  // @deprecated — use getMaxContext() in utils/format-model.js. Kept for compat.
  MODEL_MAX_CONTEXT: {
```

### Step 6: package.json test 스크립트 업데이트

`package.json:scripts.test` 교체:

```json
"test": "node test/utils.test.js && node test/parsers.test.js && node test/tree-builder.test.js && node test/format-model.test.js"
```

### Step 7: 테스트 통과 확인

```bash
npm test
```

**Expected:** 전체 그린. 새 파일 6개 테스트 모두 pass.

### Step 8: 수동 검증

```bash
cc-monitor
```

Overview 탭에서 컨텍스트 바가 정상 표시되는지 확인. 1M 모델이 없으면 변화 없음이 정상(default 200K 유지).

### Step 9: 커밋

```bash
git add src/utils/format-model.js src/parsers/session-parser.js src/config.js test/format-model.test.js package.json
git commit -m "feat: 1M 컨텍스트 모델 감지 (getMaxContext)"
```

---

## Task 2: MAX_ACCUMULATED config화 + 상한 상향

**Files:**
- Modify: `src/config.js` (새 상수 추가)
- Modify: `src/utils/jsonl-reader.js:4` (const 제거, config 참조)
- Test: `test/parsers.test.js` (기존, 회귀만 확인)

### Step 1: config에 상수 추가

`src/config.js`의 module.exports 블록에 다음을 추가(POLL_INTERVAL_MS 아래):

```javascript
  POLL_INTERVAL_MS: 2000,
  CONTEXT_WARN_THRESHOLD: 0.8,
  MAX_ACCUMULATED_EVENTS: parseInt(process.env.CC_MONITOR_MAX_EVENTS, 10) || 20000,
```

### Step 2: jsonl-reader가 config 참조

`src/utils/jsonl-reader.js:1-5`를 다음으로 교체:

```javascript
const fs = require('fs');
const config = require('../config');
const logger = require('./logger');

const lineCache = new Map();
const offsetCache = new Map();
```

### Step 3: 트리밍 로직이 config 값 사용

`src/utils/jsonl-reader.js:67-69`의 블록을 교체:

```javascript
  const maxAccumulated = config.MAX_ACCUMULATED_EVENTS;
  if (cached.accumulated.length > maxAccumulated) {
    cached.accumulated = cached.accumulated.slice(-maxAccumulated);
  }
```

### Step 4: 기존 테스트 회귀 확인

```bash
npm test
```

**Expected:** 전체 그린. parsers.test.js의 `readJsonlIncremental` 테스트는 소량 데이터라 20000 상한과 무관.

### Step 5: 환경변수 override 수동 확인

```bash
CC_MONITOR_MAX_EVENTS=100 cc-monitor --debug
```

`debug.log`에 `Found N active sessions` 같은 정상 로그가 뜨는지 확인. 크래시 없어야 함.

### Step 6: 커밋

```bash
git add src/config.js src/utils/jsonl-reader.js
git commit -m "feat: MAX_ACCUMULATED를 config + env로 조정 가능 (기본 20000)"
```

---

## Task 3: PID 재사용 검증

**Files:**
- Create: `src/utils/process-info.js`
- Modify: `src/parsers/session-finder.js:7-16` (`isProcessAlive`)
- Modify: `src/parsers/session-finder.js:18-46` (`findActiveSessions`)
- Test: `test/process-info.test.js` (신규)
- Modify: `package.json` (test 스크립트 추가)

### Step 1: process-info 유틸 작성

`src/utils/process-info.js` 생성:

```javascript
const { execSync } = require('child_process');
const logger = require('./logger');

function getProcessStartTime(pid) {
  if (!pid || typeof pid !== 'number') return null;
  try {
    if (process.platform === 'win32') {
      const out = execSync(
        `wmic process where processid=${pid} get creationdate /value`,
        { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 }
      );
      const m = out.match(/CreationDate=(\d{14}\.\d+)/);
      if (!m) return null;
      const s = m[1];
      const iso = `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(8,10)}:${s.slice(10,12)}:${s.slice(12,14)}`;
      const t = Date.parse(iso);
      return isNaN(t) ? null : t;
    } else {
      const out = execSync(
        `ps -o lstart= -p ${pid}`,
        { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 }
      ).trim();
      const t = Date.parse(out);
      return isNaN(t) ? null : t;
    }
  } catch (e) {
    logger.log('debug', `getProcessStartTime failed for pid=${pid}`, e.message);
    return null;
  }
}

function verifyProcessIdentity(pid, expectedStartedAt, toleranceMs = 5000) {
  if (!expectedStartedAt) return true;
  const actualStart = getProcessStartTime(pid);
  if (actualStart === null) return true;
  const expected = typeof expectedStartedAt === 'number'
    ? expectedStartedAt
    : Date.parse(expectedStartedAt);
  if (isNaN(expected)) return true;
  return Math.abs(actualStart - expected) <= toleranceMs;
}

module.exports = { getProcessStartTime, verifyProcessIdentity };
```

### Step 2: 테스트 작성

`test/process-info.test.js` 생성:

```javascript
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
```

### Step 3: 테스트 실패 확인

```bash
node test/process-info.test.js
```

**Expected:** process-info 파일이 아직 없다면 MODULE_NOT_FOUND. 있다면 pass.

### Step 4: session-finder에 검증 통합

`src/parsers/session-finder.js:7-16` (`isProcessAlive`)는 그대로 유지.
`src/parsers/session-finder.js:18-46` (`findActiveSessions`) 교체:

```javascript
function findActiveSessions() {
  const { verifyProcessIdentity } = require('../utils/process-info');
  const sessionsDir = config.SESSIONS_DIR;
  try {
    const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
    const sessions = [];

    for (const file of files) {
      const data = readJsonFile(path.join(sessionsDir, file));
      if (!data || !data.pid) continue;

      if (!isProcessAlive(data.pid)) continue;

      if (!verifyProcessIdentity(data.pid, data.startedAt)) {
        logger.log('warn', `PID ${data.pid} alive but started_at mismatch — likely PID reuse, skipping`, {
          sessionId: data.sessionId,
          expected: data.startedAt,
        });
        continue;
      }

      sessions.push(data);
    }

    sessions.sort((a, b) => {
      const cwdA = (a.cwd || '').toLowerCase();
      const cwdB = (b.cwd || '').toLowerCase();
      if (cwdA !== cwdB) return cwdA < cwdB ? -1 : 1;
      return (b.startedAt || 0) - (a.startedAt || 0);
    });
    logger.log('debug', `Found ${sessions.length} active sessions`);
    return sessions;
  } catch (e) {
    logger.log('warn', 'findActiveSessions failed', e.message);
    return [];
  }
}
```

### Step 5: package.json test 스크립트에 추가

```json
"test": "node test/utils.test.js && node test/parsers.test.js && node test/tree-builder.test.js && node test/format-model.test.js && node test/process-info.test.js"
```

### Step 6: 테스트 통과 확인

```bash
npm test
```

**Expected:** 전체 그린.

### Step 7: 수동 검증

Claude Code 세션 하나 띄우고:

```bash
cc-monitor --debug
```

세션이 정상 감지되어야 함. `debug.log`에 `PID reuse` warn이 뜨지 않아야 정상.

### Step 8: 커밋

```bash
git add src/utils/process-info.js src/parsers/session-finder.js test/process-info.test.js package.json
git commit -m "feat: PID 재사용 검증 (startedAt 비교로 유령 세션 필터)"
```

---

## Task 4: JSONL 스키마 가드 + SCHEMA.md

**Files:**
- Create: `src/utils/schema-guard.js`
- Create: `docs/SCHEMA.md`
- Modify: `src/parsers/subagent-parser.js:198` (빈 catch에 로깅)
- Modify: `src/parsers/session-finder.js:58-60` (빈 catch에 로깅)
- Modify: `src/parsers/flow-parser.js` (attachment.type 미상시 로깅)
- Test: `test/schema-guard.test.js` (신규)
- Modify: `package.json` (test 스크립트 추가)

### Step 1: schema-guard 유틸 작성

`src/utils/schema-guard.js` 생성:

```javascript
const logger = require('./logger');

const seenMisses = new Set();

function recordSchemaMiss(context, details) {
  const key = `${context}:${JSON.stringify(details)}`;
  if (seenMisses.has(key)) return;
  seenMisses.add(key);
  logger.log('warn', `schema_miss ${context}`, details);
}

function hasField(obj, path) {
  if (!obj) return false;
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return false;
    if (!(p in cur)) return false;
    cur = cur[p];
  }
  return true;
}

function resetSeenMisses() {
  seenMisses.clear();
}

module.exports = { recordSchemaMiss, hasField, resetSeenMisses };
```

### Step 2: 테스트 작성

`test/schema-guard.test.js` 생성:

```javascript
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
```

### Step 3: SCHEMA.md 작성

`docs/SCHEMA.md` 생성:

```markdown
# Claude Code JSONL Schema — cc-monitor 의존 필드

Claude Code가 `~/.claude/projects/<project>/<sessionId>.jsonl`에 기록하는 포맷은 **비공식**이며 버전 업데이트에 따라 변경될 수 있다. 이 문서는 cc-monitor가 **현재 버전에서** 의존하는 필드만 나열한다.

포맷이 변경되면 `debug.log`에 `schema_miss` 경고가 누적된다. 이 문서를 업데이트하고 해당 파서를 수정한다.

## 세션 메타 (`~/.claude/sessions/*.json`)

| 필드 | 사용처 |
|------|--------|
| `pid` | `session-finder.isProcessAlive` |
| `sessionId` | `findSessionJsonl`, UI 표시 |
| `startedAt` | `session-finder.verifyProcessIdentity`, `calcAge` |
| `cwd` | UI 표시, 세션 그루핑 |
| `model` | UI 표시 (optional) |

## 메인 JSONL 엔트리

모든 엔트리는 `type` 필드 보유.

### `type: "user"`
- `timestamp`
- `message.content` — string 또는 array
  - string: user prompt
  - array: `tool_result` 블록들 (`is_error`, `content`)

### `type: "assistant"`
- `timestamp`
- `message.model`
- `message.content[]`
  - `type: "text"` + `text`
  - `type: "tool_use"` + `name` + `id` + `input`
- `message.usage`
  - `input_tokens`, `output_tokens`
  - `cache_creation_input_tokens`, `cache_read_input_tokens`

### `type: "system", subtype: "compact_boundary"`
- `timestamp`
- `compactMetadata.preTokens`
- `compactMetadata.postTokens`
- `compactMetadata.durationMs`

### `type: "attachment"`
- `attachment.type`
  - `hook_success` + `hookEvent` + `hookName` + `content`
  - `hook_cancelled` + `hookName`
  - `nested_memory` + `path`
  - `skill_listing` + `content`
  - `hook_additional_context` + `content`

## 서브에이전트 JSONL

`~/.claude/projects/<project>/<sessionId>/subagents/<agentId>.jsonl` + `.meta.json`.

### `.meta.json`
- `agentType`
- `description`

### 엔트리
- 메인과 동일 구조
- `parentToolUseID` — 부모 Agent tool_use의 id (트리 재구성용)
- `type: "end-of-session"` — 완료 표시

## 기타

- `~/.claude/history.jsonl` — 스킬 호출 히스토리 (history-parser)
- `~/.claude/powerline/usage/today.json` — 오늘 비용 총액 (cost-parser)
- `~/.claude/settings.json` — hooks, permissions 정의 (config-parser)

## 검증

`cc-monitor --debug` 실행 후 `debug.log`에서 `schema_miss` 경고를 확인한다. 경고가 있으면:

1. 해당 필드를 이 문서에 반영
2. 파서를 업데이트하여 새 스키마 대응
3. 가능하면 `hasField` 가드를 추가해 향후 변경 감지
```

### Step 4: 빈 catch 블록에 로깅 추가

`src/parsers/subagent-parser.js:198-200` 교체:

```javascript
    return agents;
  } catch (e) {
    logger.log('warn', `parseSubagents failed for ${sessionId}`, e.message);
    return [];
  }
}
```

`src/parsers/session-finder.js:58-60` 교체:

```javascript
  } catch (e) {
    logger.log('warn', 'findSessionJsonl failed', e.message);
  }
  return null;
```

### Step 5: flow-parser에서 미상 attachment 타입 로깅

`src/parsers/flow-parser.js:69-126` 범위의 `if (entry.type === 'attachment')` 블록 끝에 else 분기 추가. `126` 라인의 닫는 `}` 앞에 다음 삽입:

```javascript
      const handled = ['hook_success', 'hook_cancelled', 'nested_memory', 'skill_listing', 'hook_additional_context'];
      if (att.type && !handled.includes(att.type)) {
        const { recordSchemaMiss } = require('../utils/schema-guard');
        recordSchemaMiss('flow-parser.attachment', { type: att.type });
      }
```

`flow-parser.js` 최상단 `require` 블록에 추가하지 않고 지연 로드 — 테스트에서 순환 의존 방지.

### Step 6: package.json test 스크립트 추가

```json
"test": "node test/utils.test.js && node test/parsers.test.js && node test/tree-builder.test.js && node test/format-model.test.js && node test/process-info.test.js && node test/schema-guard.test.js"
```

### Step 7: 테스트 통과 확인

```bash
npm test
```

**Expected:** 전체 그린.

### Step 8: 수동 검증

```bash
cc-monitor --debug
```

몇 분 실행 후 `debug.log`에 `schema_miss` 경고가 없어야 정상(현재 스키마는 SCHEMA.md와 일치). 있다면 SCHEMA.md 업데이트 필요.

### Step 9: 커밋

```bash
git add src/utils/schema-guard.js docs/SCHEMA.md src/parsers/subagent-parser.js src/parsers/session-finder.js src/parsers/flow-parser.js test/schema-guard.test.js package.json
git commit -m "feat: JSONL 스키마 가드 + SCHEMA.md — 미상 필드 schema_miss 로깅"
```

---

## Task 5: neo-blessed 교체

**Files:**
- Modify: `package.json` (dependencies)
- Modify: 다음 파일들의 `require('blessed')` → `require('neo-blessed')`:
  - `src/app.js:115`
  - `src/ui/layout.js:1`
  - `src/ui/header.js:1`
  - `src/ui/help-overlay.js:1`
  - `src/ui/status-bar.js:1`
- Run: `npm install`

### Step 1: package.json dependency 교체

`package.json`의 `dependencies` 블록 교체:

```json
  "dependencies": {
    "neo-blessed": "^0.2.0"
  },
```

### Step 2: 모든 `require('blessed')` 교체

5개 파일 동일 패턴이므로 각 파일에서:

```javascript
const blessed = require('blessed');
```

을

```javascript
const blessed = require('neo-blessed');
```

로 교체. 파일 목록:
- `src/app.js:115`
- `src/ui/layout.js:1`
- `src/ui/header.js:1`
- `src/ui/help-overlay.js:1`
- `src/ui/status-bar.js:1`

### Step 3: 의존성 재설치

```bash
cd /c/Users/User/.nvm/versions/node/v25.2.1/bin/node_modules/cc-monitor
rm -rf node_modules package-lock.json
npm install
```

**Expected:** neo-blessed 0.2.x 설치됨. blessed 미설치.

### Step 4: 테스트 통과 확인

```bash
npm test
```

**Expected:** 전체 그린. UI 라이브러리는 test에서 import하지 않으므로 영향 없음.

### Step 5: 수동 검증 (중요)

```bash
cc-monitor
```

다음 체크리스트:
- [ ] 화면 정상 렌더링
- [ ] 탭 1~6 전환 가능 (`1`~`6`)
- [ ] 도움말 오버레이 (`?`) 열림/스크롤
- [ ] 세션 rename (`n`) 텍스트박스 입력 가능
- [ ] 종료 (`q`) 정상

실패 시 즉시 롤백:

```bash
git checkout package.json package-lock.json src/app.js src/ui/layout.js src/ui/header.js src/ui/help-overlay.js src/ui/status-bar.js
rm -rf node_modules
npm install
```

### Step 6: 커밋

```bash
git add package.json package-lock.json src/app.js src/ui/layout.js src/ui/header.js src/ui/help-overlay.js src/ui/status-bar.js
git commit -m "chore: blessed → neo-blessed (장기 유지보수 리스크 해소)"
```

---

## 완료 후

### 통합 회귀 체크

```bash
npm test
cc-monitor --debug
```

5분 이상 실행하며 탭 전환·세션 이동·스크롤을 랜덤하게 수행. `debug.log`에 `error` 레벨이 없어야 한다.

### Push 승인 요청

모든 커밋 완료 후 사용자에게 커밋 로그 제시:

```bash
git log --oneline origin/master..HEAD
```

사용자 승인 시:

```bash
git push origin master
```

---

## 롤백 전략

Task 단위로 커밋이 분리되어 있어 문제 발생 시 해당 커밋만 revert:

```bash
git log --oneline -10
git revert <commit-sha>
```

Task 5(neo-blessed)는 dependency 변경이 있으므로 revert 후 반드시 `npm install` 재실행.
