# Agent Execution Tree Implementation Plan

**Goal:** cc-monitor에 Tab 5(Tree)를 추가하여 활성 세션의 서브에이전트 계층을 실시간 TUI 트리로 시각화한다.

**Architecture:** 메인 JSONL의 `Agent` tool_use 블록을 수집해 `{toolUseId → {description, ts}}` 맵을 만들고, subagent-parser가 반환하는 각 에이전트의 `parentToolUseID`로 부모를 결정해 `TreeNode` 그래프 조립. UI는 blessed box 두 개(트리 + 디테일)로 구성.

**Tech Stack:** Node.js (>=18), blessed, 기존 cc-monitor 패턴(assert 기반 test, jsonl-reader 유틸).

**Spec:** `docs/specs/2026-04-22-agent-execution-tree.md`

**Conventions:**
- 테스트 러너: `npm test` (`node test/utils.test.js && node test/parsers.test.js`). 새 테스트는 같은 패턴의 독립 스크립트로 작성 후 `package.json`의 `test` 스크립트에 체인 추가.
- 커밋 메시지: 한글 요약 한 줄 (기존 커밋 스타일 참고)
- 탭 번호: **Tab 5** (Tab 4는 이미 Skill Metrics 차지)

---

## Task 1 — Agent tool_use 추출 함수

**Files:**
- Create: `src/parsers/tree-builder.js`
- Create: `test/tree-builder.test.js`
- Modify: `package.json:12` (test 스크립트에 추가)

**Why:** 메인 JSONL에서 부모 링크의 기준이 되는 Agent tool_use 블록을 뽑아 `Map<toolUseId, {description, timestamp, subagentType}>` 으로 인덱싱.

- [ ] **Step 1.1: 실패 테스트 작성**

Create `test/tree-builder.test.js`:

```javascript
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
  assert.strictEqual(map.get('toolu_xyz'), undefined); // not an Agent tool
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

// 실행 결과 요약 (다른 테스트 파일 추가 시 유지)
process.on('beforeExit', () => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
});
```

- [ ] **Step 1.2: 테스트 실패 확인**

Run: `node test/tree-builder.test.js`
Expected: 모듈 로드 실패 (tree-builder.js가 없음)

- [ ] **Step 1.3: tree-builder.js 구현 (1단계)**

Create `src/parsers/tree-builder.js`:

```javascript
const logger = require('../utils/logger');

function collectAgentToolUses(entries) {
  const map = new Map();
  for (const entry of entries) {
    if (entry.type !== 'assistant' || !entry.message) continue;
    const content = entry.message.content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (block.type === 'tool_use' && block.name === 'Agent' && block.id) {
        map.set(block.id, {
          description: (block.input && block.input.description) || '',
          subagentType: (block.input && block.input.subagent_type) || '',
          timestamp: entry.timestamp || null,
        });
      }
    }
  }
  return map;
}

module.exports = { collectAgentToolUses };
```

- [ ] **Step 1.4: 테스트 통과 확인**

Run: `node test/tree-builder.test.js`
Expected: `2 passed, 0 failed`

- [ ] **Step 1.5: package.json에 테스트 추가**

Modify `package.json` line 12:

```json
"test": "node test/utils.test.js && node test/parsers.test.js && node test/tree-builder.test.js"
```

- [ ] **Step 1.6: 커밋**

```bash
git add src/parsers/tree-builder.js test/tree-builder.test.js package.json
git commit -m "트리 빌더 — Agent tool_use 추출 함수 추가"
```

---

## Task 2 — subagent-parser에 parentToolUseID 노출

**Files:**
- Modify: `src/parsers/subagent-parser.js`

**Why:** 트리 빌더가 부모를 찾으려면 각 에이전트의 `parentToolUseID`가 필요. subagent JSONL 첫 엔트리에 있음. 기존 필드에 추가만 하고 기존 동작은 보존.

- [ ] **Step 2.1: 기존 동작 확인**

Run: `node test/parsers.test.js`
Expected: 모든 기존 테스트 통과 (변경 전 baseline)

- [ ] **Step 2.2: parentToolUseID 추출 로직 추가**

Modify `src/parsers/subagent-parser.js`. `parseSubagents` 함수 내부, `entries.length > 0` 블록에서 첫 엔트리의 필드를 읽어 `parentToolUseID` 변수 선언, 마지막 `agents.push({...})`에 포함.

찾기(기존 코드):
```javascript
      let isRunning = true;
      let startTime = null;
      let endTime = null;
      let model = null;
      let tokensIn = 0;
      let tokensOut = 0;
```

교체:
```javascript
      let isRunning = true;
      let startTime = null;
      let endTime = null;
      let model = null;
      let tokensIn = 0;
      let tokensOut = 0;
      let parentToolUseID = null;
```

찾기(기존 코드):
```javascript
        if (entries.length > 0) {
          startTime = entries[0].timestamp;
          const lastEntry = entries[entries.length - 1];
```

교체:
```javascript
        if (entries.length > 0) {
          startTime = entries[0].timestamp;
          parentToolUseID = entries[0].parentToolUseID || null;
          const lastEntry = entries[entries.length - 1];
```

찾기(기존 코드 `agents.push` 블록):
```javascript
      agents.push({
        id: agentId,
        type: meta.agentType || 'unknown',
        description: meta.description || '',
        model,
        isRunning,
        elapsedMs: elapsed,
        tokensIn,
        tokensOut,
        tools,
        diagnostics,
      });
```

교체:
```javascript
      agents.push({
        id: agentId,
        type: meta.agentType || 'unknown',
        description: meta.description || '',
        model,
        isRunning,
        startTime,
        endTime,
        elapsedMs: elapsed,
        tokensIn,
        tokensOut,
        tools,
        diagnostics,
        parentToolUseID,
      });
```

- [ ] **Step 2.3: 기존 테스트 재확인 (회귀 없음)**

Run: `node test/parsers.test.js`
Expected: 기존 테스트 전부 통과

- [ ] **Step 2.4: 커밋**

```bash
git add src/parsers/subagent-parser.js
git commit -m "subagent-parser — parentToolUseID/startTime/endTime 노출"
```

---

## Task 3 — buildTree 함수

**Files:**
- Modify: `src/parsers/tree-builder.js`
- Modify: `test/tree-builder.test.js`

**Why:** 수집된 Agent tool_use 맵과 subagent 리스트를 조인해 TreeNode 그래프 조립.

- [ ] **Step 3.1: 실패 테스트 추가 (buildTree)**

`test/tree-builder.test.js` 파일 하단 `process.on('beforeExit')` 위에 추가:

```javascript
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
      diagnostics: { errors: [], deniedCount: 0, lastActivity: '', repeatPattern: null }, model: 'sonnet' },
    { id: 'a2', type: 'code-reviewer', description: 'B desc', parentToolUseID: 'tu_B',
      isRunning: true, startTime: '2026-04-22T10:01:00Z', endTime: null,
      elapsedMs: 60000, tokensIn: 200, tokensOut: 80, tools: { Grep: 5 },
      diagnostics: { errors: [], deniedCount: 0, lastActivity: '', repeatPattern: null }, model: 'haiku' },
  ];
  const mainEntriesBySubagent = new Map(); // subagentId → its own JSONL entries (for nested Agent calls)

  const tree = buildTree({ sessionId: 'SESS', mainEntries, subagents, mainEntriesBySubagent });
  assert.strictEqual(tree.root.id, 'SESS');
  assert.strictEqual(tree.root.kind, 'session');
  assert.strictEqual(tree.root.children.length, 2);
  assert.strictEqual(tree.root.children[0].id, 'a1');
  assert.strictEqual(tree.root.children[0].depth, 1);
  assert.strictEqual(tree.root.children[1].id, 'a2');
  assert.strictEqual(tree.byId.get('a1').parentId, 'SESS');
  assert.strictEqual(tree.flatten.length, 3); // root + 2 children
  assert.strictEqual(tree.flatten[0].kind, 'session');
  assert.strictEqual(tree.flatten[1].id, 'a1');
});

test('buildTree attaches orphan subagents to root', () => {
  const mainEntries = []; // no Agent tool_use
  const subagents = [
    { id: 'orph', type: 'Explore', description: 'x', parentToolUseID: 'tu_MISSING',
      isRunning: false, startTime: '2026-04-22T10:00:00Z', endTime: '2026-04-22T10:00:30Z',
      elapsedMs: 30000, tokensIn: 0, tokensOut: 0, tools: {},
      diagnostics: { errors: [], deniedCount: 0, lastActivity: '', repeatPattern: null }, model: null },
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
      diagnostics: { errors: [], deniedCount: 0, lastActivity: '', repeatPattern: null }, model: 'opus' },
    { id: 'chi', type: 'Explore', description: 'child', parentToolUseID: 'tu_child',
      isRunning: false, startTime: '2026-04-22T10:00:15Z', endTime: '2026-04-22T10:00:45Z',
      elapsedMs: 30000, tokensIn: 50, tokensOut: 30, tools: { Grep: 3 },
      diagnostics: { errors: [], deniedCount: 0, lastActivity: '', repeatPattern: null }, model: 'sonnet' },
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
```

- [ ] **Step 3.2: 테스트 실패 확인**

Run: `node test/tree-builder.test.js`
Expected: 3개 신규 테스트 실패 (buildTree 미정의)

- [ ] **Step 3.3: buildTree 구현**

`src/parsers/tree-builder.js` 하단에 추가:

```javascript
function makeNode(kind, id, opts = {}) {
  return {
    id,
    kind,
    agentType: opts.agentType || 'main',
    description: opts.description || '',
    parentId: opts.parentId || null,
    toolUseId: opts.toolUseId || null,
    depth: opts.depth || 0,
    isRunning: opts.isRunning !== undefined ? opts.isRunning : false,
    startTime: opts.startTime || null,
    endTime: opts.endTime || null,
    elapsedMs: opts.elapsedMs || 0,
    model: opts.model || null,
    tokensIn: opts.tokensIn || 0,
    tokensOut: opts.tokensOut || 0,
    tools: opts.tools || {},
    diagnostics: opts.diagnostics || { errors: [], deniedCount: 0, lastActivity: '', repeatPattern: null },
    children: [],
  };
}

function buildTree({ sessionId, mainEntries, subagents, mainEntriesBySubagent }) {
  // 1) 루트 세션 노드
  const root = makeNode('session', sessionId, { agentType: 'main', depth: 0 });

  // 2) 전체 Agent tool_use 맵 구성: main + 각 서브에이전트 JSONL 내부
  const toolUseIdToAgentId = new Map(); // toolUseId → subagentId (부모 매핑용 역방향)
  const toolUseMetaFromMain = collectAgentToolUses(mainEntries);
  // 각 서브에이전트가 자신의 JSONL에서 호출한 Agent tool_use의 id 수집
  // 구조: Map<toolUseId, parentSubagentId>
  const toolUseIdToParentSubagent = new Map();
  if (mainEntriesBySubagent) {
    for (const [subagentId, entries] of mainEntriesBySubagent.entries()) {
      const m = collectAgentToolUses(entries);
      for (const toolId of m.keys()) {
        toolUseIdToParentSubagent.set(toolId, subagentId);
      }
    }
  }

  // 3) 서브에이전트 → 노드 변환 (부모 미할당 상태로)
  const byId = new Map();
  byId.set(root.id, root);

  const agentNodes = subagents.map(sa => {
    const node = makeNode('agent', sa.id, {
      agentType: sa.type || 'unknown',
      description: sa.description || '',
      toolUseId: sa.parentToolUseID || null,
      isRunning: !!sa.isRunning,
      startTime: sa.startTime || null,
      endTime: sa.endTime || null,
      elapsedMs: sa.elapsedMs || 0,
      model: sa.model || null,
      tokensIn: sa.tokensIn || 0,
      tokensOut: sa.tokensOut || 0,
      tools: sa.tools || {},
      diagnostics: sa.diagnostics || { errors: [], deniedCount: 0, lastActivity: '', repeatPattern: null },
    });
    byId.set(node.id, node);
    return node;
  });

  // 4) 부모 결정: parentToolUseID로 (1) 메인의 Agent tool_use면 root 자식, (2) 서브에이전트 내부면 그 서브에이전트 자식
  for (const node of agentNodes) {
    const parentToolUseID = node.toolUseId;
    let parent = null;

    if (parentToolUseID) {
      if (toolUseMetaFromMain.has(parentToolUseID)) {
        parent = root;
      } else if (toolUseIdToParentSubagent.has(parentToolUseID)) {
        const parentSubId = toolUseIdToParentSubagent.get(parentToolUseID);
        parent = byId.get(parentSubId) || null;
      }
    }

    if (!parent) {
      logger.log('debug', `tree: orphan subagent ${node.id} parentToolUseID=${parentToolUseID}, attach to root`);
      parent = root;
    }

    node.parentId = parent.id;
    node.depth = parent.depth + 1;
    parent.children.push(node);
  }

  // 5) 각 부모의 children은 startTime asc 정렬
  function sortChildren(n) {
    n.children.sort((a, b) => {
      const ta = a.startTime ? Date.parse(a.startTime) : 0;
      const tb = b.startTime ? Date.parse(b.startTime) : 0;
      return ta - tb;
    });
    n.children.forEach(sortChildren);
  }
  sortChildren(root);

  // 6) DFS flatten
  const flatten = [];
  function walk(n) {
    flatten.push(n);
    for (const c of n.children) walk(c);
  }
  walk(root);

  return { root, byId, flatten };
}

module.exports = { collectAgentToolUses, buildTree };
```

- [ ] **Step 3.4: 테스트 통과 확인**

Run: `node test/tree-builder.test.js`
Expected: `5 passed, 0 failed`

- [ ] **Step 3.5: 커밋**

```bash
git add src/parsers/tree-builder.js test/tree-builder.test.js
git commit -m "트리 빌더 — buildTree 함수 구현 (N단계 중첩, orphan fallback)"
```

---

## Task 4 — 트리 데이터 로드 헬퍼 (I/O)

**Files:**
- Modify: `src/parsers/tree-builder.js`

**Why:** Task 3의 `buildTree`는 순수 함수. 실제 세션 디렉터리로부터 main entries + 서브에이전트 JSONL entries를 읽어 buildTree에 넘기는 I/O 래퍼 추가.

- [ ] **Step 4.1: 로더 구현**

`src/parsers/tree-builder.js` 상단 `const logger = require...` 아래에 추가:

```javascript
const fs = require('fs');
const path = require('path');
const { readJsonlFile } = require('../utils/jsonl-reader');
const { parseSubagents } = require('./subagent-parser');
```

하단 `module.exports` 위에 추가:

```javascript
function loadTreeData(projectDir, sessionId, mainJsonlPath) {
  const mainEntries = mainJsonlPath && fs.existsSync(mainJsonlPath)
    ? readJsonlFile(mainJsonlPath).entries
    : [];

  const subagents = parseSubagents(projectDir, sessionId);

  const mainEntriesBySubagent = new Map();
  const subagentsDir = path.join(projectDir, sessionId, 'subagents');
  if (fs.existsSync(subagentsDir)) {
    for (const sa of subagents) {
      const jsonl = path.join(subagentsDir, `${sa.id}.jsonl`);
      if (fs.existsSync(jsonl)) {
        mainEntriesBySubagent.set(sa.id, readJsonlFile(jsonl).entries);
      }
    }
  }

  return buildTree({ sessionId, mainEntries, subagents, mainEntriesBySubagent });
}
```

`module.exports` 수정:
```javascript
module.exports = { collectAgentToolUses, buildTree, loadTreeData };
```

- [ ] **Step 4.2: smoke 테스트 (실제 세션으로 크래시 없는지 확인)**

Run:
```bash
node -e "
const logger = require('./src/utils/logger'); logger.init(false);
const { findActiveSessions, findSessionJsonl } = require('./src/parsers/session-finder');
const { loadTreeData } = require('./src/parsers/tree-builder');
const sessions = findActiveSessions();
if (sessions.length === 0) { console.log('no active sessions — skip'); process.exit(0); }
const s = sessions[0];
const j = findSessionJsonl(s);
if (!j) { console.log('no jsonl — skip'); process.exit(0); }
const tree = loadTreeData(j.projectDir, s.sessionId, j.jsonlPath);
console.log('root:', tree.root.id, 'flatten:', tree.flatten.length);
tree.flatten.slice(0,5).forEach(n => console.log(' -', n.kind, n.agentType, n.id.substring(0,10), 'depth:', n.depth, 'parent:', n.parentId && n.parentId.substring(0,10)));
"
```
Expected: 크래시 없이 root + N개 노드 출력 (세션 없으면 "no active sessions — skip")

- [ ] **Step 4.3: 커밋**

```bash
git add src/parsers/tree-builder.js
git commit -m "트리 빌더 — loadTreeData I/O 래퍼 추가"
```

---

## Task 5 — Tree 패널 UI

**Files:**
- Create: `src/ui/tree-panel.js`

**Why:** blessed 기반 Tree 탭 UI. 상단(tree) + 하단(details) 두 박스, 상태(mode, cursorIdx) 캡슐화.

- [ ] **Step 5.1: tree-panel.js 생성**

Create `src/ui/tree-panel.js`:

```javascript
const blessed = require('blessed');
const { createSection } = require('./layout');
const { formatDuration, formatTokenCount } = require('../utils/time-format');
const { formatModelTag } = require('../utils/format-model');
const config = require('../config');
const I = config.ICONS;

const RECENT_MS = 5 * 60 * 1000;

function createTreePanel(screen) {
  const treeBox = createSection({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: '70%',
    label: ` ${I.agent} Agent Execution Tree `,
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: '█', style: { bg: 'cyan' }, track: { bg: 'black' } },
  });

  const detailBox = createSection({
    parent: screen,
    top: '70%',
    left: 0,
    width: '100%',
    height: '30%-1', // status bar 1줄
    label: ` Details `,
    tags: true,
    scrollable: true,
  });

  return {
    boxes: [treeBox, detailBox],
    treeBox,
    detailBox,
    state: {
      cursorIdx: 0,
      selectedId: null,
      mode: 'recent', // 'recent' | 'all'
      visibleFlatten: [],
    },
  };
}

function nodeIcon(node) {
  if (node.kind === 'session') return `{cyan-fg}${I.session}{/cyan-fg}`;
  if (node.diagnostics && node.diagnostics.errors && node.diagnostics.errors.length > 0) {
    return `{red-fg}${I.warn}{/red-fg}`;
  }
  if (node.isRunning) return `{green-fg}${I.agent}{/green-fg}`;
  // recent completed?
  if (node.endTime) {
    const age = Date.now() - Date.parse(node.endTime);
    if (age < RECENT_MS) return `{blue-fg}${I.recap}{/blue-fg}`;
  }
  return `{gray-fg}${I.agentDone}{/gray-fg}`;
}

function filterFlatten(flatten, mode) {
  if (mode === 'all') return flatten;
  // recent: running + endTime이 최근 5분 이내 + session root
  return flatten.filter(n => {
    if (n.kind === 'session') return true;
    if (n.isRunning) return true;
    if (n.endTime && Date.now() - Date.parse(n.endTime) < RECENT_MS) return true;
    return false;
  });
}

function buildTreePrefix(node, visibleSet) {
  // 트리 prefix 생성: 부모 체인을 따라가며 형제 중 마지막인지 체크
  // 여기선 단순화: depth별 "│  " 또는 "   ", 마지막 자식은 "└─" 아니면 "├─"
  // 단, visibleSet에 포함된 형제만 고려
  if (node.depth === 0) return '';
  const ancestors = [];
  let cur = node;
  while (cur && cur.parentId) {
    const parentNode = findInSet(visibleSet, cur.parentId);
    ancestors.unshift({ node: cur, parent: parentNode });
    cur = parentNode;
  }
  let prefix = '';
  for (let i = 0; i < ancestors.length; i++) {
    const { node: n, parent } = ancestors[i];
    if (!parent) break;
    const visibleSiblings = parent.children.filter(c => visibleSet.has(c.id));
    const isLast = visibleSiblings.length > 0 && visibleSiblings[visibleSiblings.length - 1].id === n.id;
    const isTerminal = i === ancestors.length - 1;
    if (isTerminal) {
      prefix += isLast ? '└─ ' : '├─ ';
    } else {
      prefix += isLast ? '   ' : '│  ';
    }
  }
  return prefix;
}

function findInSet(set, id) {
  for (const n of set.values()) if (n.id === id) return n;
  return null;
}

function topTools(toolsObj, limit = 4) {
  const entries = Object.entries(toolsObj || {}).sort((a, b) => b[1] - a[1]);
  return entries.slice(0, limit).map(([n, c]) => `${n}:${c}`).join(' ');
}

function formatNodeLines(node, prefix, isCursor) {
  const icon = nodeIcon(node);
  const cursor = isCursor ? '{bold}{cyan-fg}▶{/cyan-fg}{/bold}' : ' ';
  const label = node.kind === 'session'
    ? `{bold}main{/bold}`
    : `{bold}${node.agentType || 'unknown'}{/bold}`;
  const modelStr = node.model ? `  ${formatModelTag(node.model)}` : '';
  const durStr = node.elapsedMs ? `  {cyan-fg}${I.clock} ${formatDuration(node.elapsedMs)}{/cyan-fg}` : '';
  const status = node.kind === 'agent'
    ? (node.isRunning ? '  {green-fg}running{/green-fg}' : '  {gray-fg}done{/gray-fg}')
    : '';
  const line1 = `${cursor} ${prefix}${icon} ${label}${modelStr}${durStr}${status}`;

  const linesOut = [line1];

  if (node.kind === 'agent' && node.description) {
    const desc = node.description.length > 80
      ? node.description.substring(0, 80) + '…'
      : node.description;
    linesOut.push(`  ${prefix.replace(/[├└]─\s?/, '│  ')}    {gray-fg}"${desc}"{/gray-fg}`);
  }

  const toolStr = topTools(node.tools);
  if (toolStr) {
    linesOut.push(`  ${prefix.replace(/[├└]─\s?/, '│  ')}    {gray-fg}🛠 ${toolStr}{/gray-fg}`);
  }

  return linesOut;
}

function renderTree(state, treeData) {
  const filtered = filterFlatten(treeData.flatten, state.mode);
  state.visibleFlatten = filtered;

  if (filtered.length === 0) {
    return '{gray-fg}(no agents visible){/gray-fg}';
  }

  const visibleSet = new Map();
  filtered.forEach(n => visibleSet.set(n.id, n));

  // cursor 복원
  let cursorIdx = state.cursorIdx;
  if (state.selectedId) {
    const idx = filtered.findIndex(n => n.id === state.selectedId);
    cursorIdx = idx >= 0 ? idx : 0;
  }
  if (cursorIdx >= filtered.length) cursorIdx = filtered.length - 1;
  if (cursorIdx < 0) cursorIdx = 0;
  state.cursorIdx = cursorIdx;
  state.selectedId = filtered[cursorIdx] && filtered[cursorIdx].id;

  const lines = [];
  filtered.forEach((node, idx) => {
    const prefix = buildTreePrefix(node, visibleSet);
    const isCursor = idx === cursorIdx;
    lines.push(...formatNodeLines(node, prefix, isCursor));
  });

  return lines.join('\n');
}

function renderDetail(state, treeData) {
  const node = state.selectedId && treeData.byId.get(state.selectedId);
  if (!node) return '{gray-fg}(no selection){/gray-fg}';

  const lines = [];
  if (node.kind === 'session') {
    lines.push(`{bold}Selected:{/bold} main session`);
    lines.push(`{bold}Session ID:{/bold} ${node.id}`);
    const totalChildren = treeData.flatten.filter(n => n.kind === 'agent').length;
    const running = treeData.flatten.filter(n => n.kind === 'agent' && n.isRunning).length;
    lines.push(`{bold}Agents:{/bold} total ${totalChildren}, running ${running}`);
  } else {
    lines.push(`{bold}Selected:{/bold} ${node.agentType}  {gray-fg}(${node.id.substring(0, 10)}){/gray-fg}`);
    lines.push(`{bold}Description:{/bold} ${node.description || '(none)'}`);
    const statusStr = node.isRunning ? '{green-fg}running{/green-fg}' : '{gray-fg}done{/gray-fg}';
    lines.push(`{bold}Status:{/bold} ${statusStr}  •  Started ${node.startTime || '?'}  •  Duration ${formatDuration(node.elapsedMs)}`);
    lines.push(`{bold}Model:{/bold} ${node.model || '?'}  •  Tokens In: ${formatTokenCount(node.tokensIn)}  Out: ${formatTokenCount(node.tokensOut)}`);
    const toolStr = topTools(node.tools, 8) || '(none)';
    lines.push(`{bold}Tools:{/bold} ${toolStr}`);
    const d = node.diagnostics || {};
    if (d.lastActivity) {
      const act = d.lastActivity.split('\n')[0].trim();
      const trunc = act.length > 100 ? act.substring(0, 100) + '…' : act;
      lines.push(`{bold}Last activity:{/bold} {gray-fg}${trunc}{/gray-fg}`);
    }
    const err = d.errors ? d.errors.length : 0;
    lines.push(`{bold}Diagnostics:{/bold} ${err} errors, ${d.deniedCount || 0} denied`);
    if (err > 0) {
      const lastErr = d.errors[d.errors.length - 1].split('\n')[0].trim();
      lines.push(`  {red-fg}⚠ ${lastErr.substring(0, 120)}{/red-fg}`);
    }
  }

  return lines.join('\n');
}

function updateTreePanel(panel, treeData) {
  const { treeBox, detailBox, state } = panel;
  treeBox.setLabel(` ${I.agent} Agent Execution Tree  {gray-fg}— Mode: [${state.mode}]  (a=toggle){/gray-fg} `);
  treeBox.setContent(renderTree(state, treeData));
  detailBox.setContent(renderDetail(state, treeData));
}

function moveCursor(panel, delta, treeData) {
  const filtered = panel.state.visibleFlatten;
  if (filtered.length === 0) return;
  let idx = panel.state.cursorIdx + delta;
  if (idx < 0) idx = 0;
  if (idx >= filtered.length) idx = filtered.length - 1;
  panel.state.cursorIdx = idx;
  panel.state.selectedId = filtered[idx].id;
  updateTreePanel(panel, treeData);
}

function toggleMode(panel, treeData) {
  panel.state.mode = panel.state.mode === 'recent' ? 'all' : 'recent';
  updateTreePanel(panel, treeData);
}

module.exports = { createTreePanel, updateTreePanel, moveCursor, toggleMode };
```

- [ ] **Step 5.2: require 체크 (syntax)**

Run: `node -e "require('./src/ui/tree-panel')" 2>&1`
Expected: 출력 없음 (로드 성공)

- [ ] **Step 5.3: 커밋**

```bash
git add src/ui/tree-panel.js
git commit -m "Tree 패널 UI — 트리 렌더러 + 디테일 패널 + 모드/커서 상태"
```

---

## Task 6 — app.js 통합 (Tab 5)

**Files:**
- Modify: `src/app.js`

**Why:** Tree 패널을 Tab 5로 등록하고 키 바인딩 연결.

- [ ] **Step 6.1: require 추가**

`src/app.js` 파일 상단의 require 블록 근처에 추가. 찾기:

```javascript
const {
  createMetricsSummaryPanel, updateMetricsSummaryPanel,
  createMetricsTablePanel, updateMetricsTablePanel,
} = require('./ui/skill-metrics-panel');
```

교체:

```javascript
const {
  createMetricsSummaryPanel, updateMetricsSummaryPanel,
  createMetricsTablePanel, updateMetricsTablePanel,
} = require('./ui/skill-metrics-panel');

const { createTreePanel, updateTreePanel, moveCursor: moveTreeCursor, toggleMode: toggleTreeMode } = require('./ui/tree-panel');
const { loadTreeData } = require('./parsers/tree-builder');
```

- [ ] **Step 6.2: Tab 5 패널 생성**

찾기 (`// === Tab 4: Skill Metrics ===` 블록 끝):

```javascript
  const metricsTable = createMetricsTablePanel(screen);
  metricsPanels.push(metricsTable);

  // === Rename prompt ===
```

교체:

```javascript
  const metricsTable = createMetricsTablePanel(screen);
  metricsPanels.push(metricsTable);

  // === Tab 5: Tree ===
  const treePanel = createTreePanel(screen);
  const treePanels = treePanel.boxes;
  let latestTreeData = null;

  // === Rename prompt ===
```

- [ ] **Step 6.3: showTab에 Tab 5 추가**

찾기:

```javascript
  function showTab(tab) {
    currentTab = tab;
    overviewPanels.forEach(p => { p.hidden = tab !== 1; });
    flowPanels.forEach(p => { p.hidden = tab !== 2; });
    configPanels.forEach(p => { p.hidden = tab !== 3; });
    metricsPanels.forEach(p => { p.hidden = tab !== 4; });
    screen.realloc();
    screen.render();
  }
```

교체:

```javascript
  function showTab(tab) {
    currentTab = tab;
    overviewPanels.forEach(p => { p.hidden = tab !== 1; });
    flowPanels.forEach(p => { p.hidden = tab !== 2; });
    configPanels.forEach(p => { p.hidden = tab !== 3; });
    metricsPanels.forEach(p => { p.hidden = tab !== 4; });
    treePanels.forEach(p => { p.hidden = tab !== 5; });
    screen.realloc();
    screen.render();
  }
```

- [ ] **Step 6.4: refresh에 Tab 5 분기 추가**

찾기 (Tab 3 early-return 블록 바로 아래):

```javascript
    if (currentTab === 4) {
      const metricsData = parseSkillMetrics();
      updateMetricsSummaryPanel(metricsSummary, metricsData);
      updateMetricsTablePanel(metricsTable, metricsData);
      updateStatusBar(statusBar, config.POLL_INTERVAL_MS, 0, 0, currentTab);
      screen.render();
      return;
    }
```

이 블록 **뒤에** 추가 (세션 의존 Tab이므로 activeSessions 로드 이후로 이동 필요 — 아래 `else` 블록 수정으로 통합):

찾기:

```javascript
    } else {
      // Flow tab
      allFlowEvents = parseFlowEvents(jsonlInfo.jsonlPath);
      const summary = buildFlowSummary(allFlowEvents);
      updateFlowSummaryPanel(flowSummary, summary);
      updateFlowTimelinePanel(flowTimeline, getFilteredFlowEvents(), true);
      updateFlowFilterBar(flowFilterBar, flowFilters);
    }
```

교체:

```javascript
    } else if (currentTab === 2) {
      // Flow tab
      allFlowEvents = parseFlowEvents(jsonlInfo.jsonlPath);
      const summary = buildFlowSummary(allFlowEvents);
      updateFlowSummaryPanel(flowSummary, summary);
      updateFlowTimelinePanel(flowTimeline, getFilteredFlowEvents(), true);
      updateFlowFilterBar(flowFilterBar, flowFilters);
    } else if (currentTab === 5) {
      // Tree tab
      latestTreeData = loadTreeData(jsonlInfo.projectDir, session.sessionId, jsonlInfo.jsonlPath);
      updateTreePanel(treePanel, latestTreeData);
    }
```

또한 "No active sessions" 처리 블록에서 Tab 5도 기본 메시지가 뜨도록 추가. 찾기:

```javascript
      } else if (currentTab === 2) {
        flowSummary.setContent('{center}{bold}No active sessions.{/bold}{/center}');
        flowTimeline.setContent('');
      }
```

교체:

```javascript
      } else if (currentTab === 2) {
        flowSummary.setContent('{center}{bold}No active sessions.{/bold}{/center}');
        flowTimeline.setContent('');
      } else if (currentTab === 5) {
        treePanel.treeBox.setContent('{center}{bold}No active sessions.{/bold}{/center}');
        treePanel.detailBox.setContent('');
      }
```

마찬가지로 `no jsonl` 블록도 찾기:

```javascript
      } else {
        flowSummary.setContent(`{center}${msg}{/center}`);
        flowTimeline.setContent('');
      }
```

교체:

```javascript
      } else if (currentTab === 2) {
        flowSummary.setContent(`{center}${msg}{/center}`);
        flowTimeline.setContent('');
      } else if (currentTab === 5) {
        treePanel.treeBox.setContent(`{center}${msg}{/center}`);
        treePanel.detailBox.setContent('');
      }
```

- [ ] **Step 6.5: 키 바인딩 추가**

`5` 탭 키: 찾기:

```javascript
  screen.key(['4'], () => {
    if (helpVisible) return;
    showTab(4);
    refresh();
  });
```

교체:

```javascript
  screen.key(['4'], () => {
    if (helpVisible) return;
    showTab(4);
    refresh();
  });

  screen.key(['5'], () => {
    if (helpVisible) return;
    showTab(5);
    refresh();
  });
```

Tab 5에서 `up`/`down`은 트리 커서 이동, `[`/`]`로 세션 전환, `a`로 모드 토글.

찾기 (기존 up 핸들러):

```javascript
  screen.key(['up'], () => {
    if (helpVisible) { helpOverlay.scroll(-3); screen.render(); return; }
    if (currentTab === 2) { flowTimeline.scroll(-3); screen.render(); return; }
    if (currentTab === 3) { configTree.scroll(-3); screen.render(); return; }
    if (currentTab === 4) { metricsTable.scroll(-3); screen.render(); return; }
    if (activeSessions.length > 1) {
      currentSessionIdx = (currentSessionIdx - 1 + activeSessions.length) % activeSessions.length;
      resetCache();
      refresh();
    }
  });
```

교체:

```javascript
  screen.key(['up'], () => {
    if (helpVisible) { helpOverlay.scroll(-3); screen.render(); return; }
    if (currentTab === 2) { flowTimeline.scroll(-3); screen.render(); return; }
    if (currentTab === 3) { configTree.scroll(-3); screen.render(); return; }
    if (currentTab === 4) { metricsTable.scroll(-3); screen.render(); return; }
    if (currentTab === 5) {
      if (latestTreeData) { moveTreeCursor(treePanel, -1, latestTreeData); screen.render(); }
      return;
    }
    if (activeSessions.length > 1) {
      currentSessionIdx = (currentSessionIdx - 1 + activeSessions.length) % activeSessions.length;
      resetCache();
      refresh();
    }
  });
```

찾기 (down 핸들러):

```javascript
  screen.key(['down'], () => {
    if (helpVisible) { helpOverlay.scroll(3); screen.render(); return; }
    if (currentTab === 2) { flowTimeline.scroll(3); screen.render(); return; }
    if (currentTab === 3) { configTree.scroll(3); screen.render(); return; }
    if (currentTab === 4) { metricsTable.scroll(3); screen.render(); return; }
    if (activeSessions.length > 1) {
      currentSessionIdx = (currentSessionIdx + 1) % activeSessions.length;
      resetCache();
      refresh();
    }
  });
```

교체:

```javascript
  screen.key(['down'], () => {
    if (helpVisible) { helpOverlay.scroll(3); screen.render(); return; }
    if (currentTab === 2) { flowTimeline.scroll(3); screen.render(); return; }
    if (currentTab === 3) { configTree.scroll(3); screen.render(); return; }
    if (currentTab === 4) { metricsTable.scroll(3); screen.render(); return; }
    if (currentTab === 5) {
      if (latestTreeData) { moveTreeCursor(treePanel, 1, latestTreeData); screen.render(); }
      return;
    }
    if (activeSessions.length > 1) {
      currentSessionIdx = (currentSessionIdx + 1) % activeSessions.length;
      resetCache();
      refresh();
    }
  });
```

Tab 5 전용 키 `a`, `[`, `]` 추가. `u` 키 바인딩(flow user 필터) 블록 아래에 추가:

찾기:

```javascript
  screen.key(['u'], () => { if (!helpVisible && currentTab === 2) toggleFilter('user'); });
```

교체:

```javascript
  screen.key(['u'], () => { if (!helpVisible && currentTab === 2) toggleFilter('user'); });

  // Tree tab keys
  screen.key(['a'], () => {
    if (helpVisible || renameActive) return;
    if (currentTab !== 5 || !latestTreeData) return;
    toggleTreeMode(treePanel, latestTreeData);
    screen.render();
  });

  screen.key(['['], () => {
    if (helpVisible || renameActive) return;
    if (currentTab !== 5) return;
    if (activeSessions.length > 1) {
      currentSessionIdx = (currentSessionIdx - 1 + activeSessions.length) % activeSessions.length;
      resetCache();
      refresh();
    }
  });

  screen.key([']'], () => {
    if (helpVisible || renameActive) return;
    if (currentTab !== 5) return;
    if (activeSessions.length > 1) {
      currentSessionIdx = (currentSessionIdx + 1) % activeSessions.length;
      resetCache();
      refresh();
    }
  });
```

- [ ] **Step 6.6: 수동 smoke**

Run: `node bin/cc-monitor.js --debug` (별도 터미널에서 Claude Code 세션 실행 중이어야 함)
검증:
- [ ] Tab 1~4 정상 작동 (회귀 없음)
- [ ] `5` 키로 Tab 5 진입, "Agent Execution Tree" 박스 표시
- [ ] 세션에 subagent가 있으면 트리 표시, 없으면 root만 + "(no agents visible)"
- [ ] ↑↓으로 커서 이동 (`▶` 마커)
- [ ] `a`로 mode 토글 시 라벨이 `[recent] → [all]` 변경
- [ ] `[`/`]`로 세션 전환 (다중 세션 시)
- [ ] `q` 또는 ESC 종료 정상
- [ ] 크래시 없이 2초 주기 refresh

- [ ] **Step 6.7: 커밋**

```bash
git add src/app.js
git commit -m "Tab 5 Tree 통합 — 패널 생성, refresh 분기, 키 바인딩"
```

---

## Task 7 — Help overlay + README

**Files:**
- Modify: `src/ui/help-overlay.js`
- Modify: `README.md`

**Why:** `?` 도움말과 공식 README에 Tab 5 설명 추가.

- [ ] **Step 7.1: help-overlay 상단 키보드 행에 `5` 추가**

찾기:

```javascript
    '  {bold}{cyan-fg}1{/cyan-fg}{/bold}  Overview 탭        {bold}{cyan-fg}2{/cyan-fg}{/bold}  Flow 탭        {bold}{cyan-fg}3{/cyan-fg}{/bold}  Config 탭',
```

교체 (가능하면 한 줄 유지하되 길면 두 줄로):

```javascript
    '  {bold}{cyan-fg}1{/cyan-fg}{/bold}  Overview   {bold}{cyan-fg}2{/cyan-fg}{/bold}  Flow   {bold}{cyan-fg}3{/cyan-fg}{/bold}  Config   {bold}{cyan-fg}4{/cyan-fg}{/bold}  Metrics   {bold}{cyan-fg}5{/cyan-fg}{/bold}  Tree',
```

- [ ] **Step 7.2: help-overlay 하단에 Tab 5 섹션 추가**

찾기 (Tab 3 Config 섹션):

```javascript
    `  {bold}{cyan-fg}◈ Plugins{/cyan-fg}{/bold}  settings.json enabledPlugins`,
    '',
    '',
    S,
    `  {bold}{yellow-fg}${I.warn}  트러블슈팅{/yellow-fg}{/bold}`,
    S,
```

교체 (Config와 트러블슈팅 사이에 Tab 5 섹션 삽입):

```javascript
    `  {bold}{cyan-fg}◈ Plugins{/cyan-fg}{/bold}  settings.json enabledPlugins`,
    '',
    '',
    S,
    `  {bold}{yellow-fg}${I.agent}  Tab 5 — Tree{/yellow-fg}{/bold}`,
    S,
    '',
    '  활성 세션의 서브에이전트 계층 구조를 실시간 트리로 표시.',
    '  parentToolUseID 링크로 부모-자식 관계를 정확히 그립니다.',
    '',
    '  {bold}키보드{/bold}:',
    '    {bold}{cyan-fg}↑↓{/cyan-fg}{/bold}  노드 선택',
    '    {bold}{cyan-fg}[{/cyan-fg}{/bold} {bold}{cyan-fg}]{/cyan-fg}{/bold}  세션 전환 (↑↓ 대신)',
    '    {bold}{cyan-fg}a{/cyan-fg}{/bold}  running+recent ↔ all 토글',
    '',
    '  {bold}아이콘{/bold}:',
    `    {green-fg}${I.agent}{/green-fg} running   {gray-fg}${I.agentDone}{/gray-fg} done   {blue-fg}${I.recap}{/blue-fg} recent done (<5분)`,
    `    {red-fg}${I.warn}{/red-fg} error   {cyan-fg}${I.session}{/cyan-fg} session root`,
    '',
    '',
    S,
    `  {bold}{yellow-fg}${I.warn}  트러블슈팅{/yellow-fg}{/bold}`,
    S,
```

- [ ] **Step 7.3: README.md에 Tab 5 섹션 추가**

찾기 (README의 Tab 3 Config 섹션 끝 `---` 바로 전):

```markdown
│     user     C:\Users\User\.claude\CLAUDE.md (1.5K)                     │
│   📏 Rules                                                              │
│     project  ajax-common-rules.md                                       │
│     project  behavior.md                                                │
│     user     dhtmlx-grid-rules.md                                       │
│   🔗 Hooks                                                              │
│     SessionStart  skill-activation-protocol                             │
│     UserPromptSubmit  skill-activation-protocol                         │
│   ⚡ Skills                                                              │
│     brainstorming, debugging, commit, ...                               │
│   🔌 MCP Servers                                                        │
│     playwright, notion, mariadb, ...                                    │
│   🧠 Memory                                                             │
│     user_code_style.md, feedback_slip_amount.md, ...                    │
└──────────────── [1:Overview] [2:Flow] [3:Config]  ?:help  n:rename  q:quit ─┘
```
```

추가 (이 markdown 블록 끝 뒤에, `---` 앞에 새 섹션 삽입):

```markdown
│     user     C:\Users\User\.claude\CLAUDE.md (1.5K)                     │
│   📏 Rules                                                              │
│     project  ajax-common-rules.md                                       │
│     project  behavior.md                                                │
│     user     dhtmlx-grid-rules.md                                       │
│   🔗 Hooks                                                              │
│     SessionStart  skill-activation-protocol                             │
│     UserPromptSubmit  skill-activation-protocol                         │
│   ⚡ Skills                                                              │
│     brainstorming, debugging, commit, ...                               │
│   🔌 MCP Servers                                                        │
│     playwright, notion, mariadb, ...                                    │
│   🧠 Memory                                                             │
│     user_code_style.md, feedback_slip_amount.md, ...                    │
└──────────────── [1:Overview] [2:Flow] [3:Config]  ?:help  n:rename  q:quit ─┘
```

---

## Tab 5 — Tree

활성 세션의 서브에이전트 계층 구조를 실시간 트리로 표시. `Agent` tool_use 호출의 `parentToolUseID`를 따라 부모-자식 관계를 정확히 그립니다.

```
┌─ ● Agent Execution Tree — Mode: [recent]  (a=toggle) ──────────────────┐
│ ▶ ◉ main (opus-4-6)  ◷ 1h 23m                                           │
│      🛠 Read:45 Grep:20 Bash:15 Edit:12                                 │
│   ├─ ● feature-dev:code-explorer  sonnet  ◷ 2m 31s  running            │
│   │     "Trace the auth middleware flow"                                │
│   │     🛠 Glob:3 Grep:8 Read:12                                        │
│   │   └─ ● Explore  sonnet  ◷ 45s  running                              │
│   │        "Find API endpoints"                                         │
│   │        🛠 Glob:5 Read:7                                             │
│   └─ ↻ code-reviewer  sonnet  ◷ 1m 5s  done                             │
│        "Review authentication module"                                   │
│        🛠 Read:15 Grep:4                                                │
├─ Details ───────────────────────────────────────────────────────────────┤
│  Selected: code-reviewer (a2a48fe0...)                                  │
│  Description: Review authentication module                              │
│  Status: done  •  Started 14:21:08  •  Duration 1m 5s                   │
│  Model: sonnet-4-6  •  Tokens In: 12.4K  Out: 2.1K                      │
│  Tools: Read:15 Grep:4                                                  │
│  Diagnostics: 0 errors, 0 denied                                        │
└──────── [1:Overview] [2:Flow] [3:Config] [4:Metrics] [5:Tree] ──────────┘
```

### 키보드

| 키 | 동작 |
|-----|------|
| `↑/↓` | 노드 선택 이동 |
| `[` / `]` | 세션 전환 (Tab 5에서는 ↑↓ 대신) |
| `a` | `running+recent` ↔ `all` 토글 |

### 상태 아이콘

| 아이콘 | 의미 |
|--------|------|
| `●` (녹색) | running |
| `✓` (회색) | done |
| `↻` (파랑) | recent done (5분 이내 완료) |
| `⚠` (빨강) | error |
| `◉` (청록) | session root |

---
```

- [ ] **Step 7.4: 커밋**

```bash
git add src/ui/help-overlay.js README.md
git commit -m "Tab 5 Tree 문서화 — help overlay + README 섹션"
```

---

## Task 8 — 전체 테스트 재확인

**Files:** (없음 — 실행만)

- [ ] **Step 8.1: 전체 테스트 실행**

Run: `npm test`
Expected: 모든 테스트 통과

- [ ] **Step 8.2: 수동 회귀 + 기능 smoke**

Run: `node bin/cc-monitor.js`
확인:
- Tab 1~4 이상 없음
- Tab 5 진입 시 트리 표시 (세션 + 서브에이전트)
- ↑↓ 커서 이동, Details 즉시 갱신
- `a` 토글 → running+recent ↔ all
- `[`/`]` 세션 전환 (다중 세션 시)
- `q`/ESC 정상 종료

- [ ] **Step 8.3: 최종 커밋 (수정 없으면 생략)**

수정 필요 시:
```bash
git add -A
git commit -m "Tab 5 smoke 후 마무리"
```

---

## Self-Review

**Spec coverage:**
- 3.1 실시간 관찰 → Task 6 (refresh 2초 주기에 편승)
- 3.2 새 5번 Tree 탭 → Task 6 (탭 등록)
- 3.3 서브에이전트 + 툴 요약 → Task 5 (`topTools`), Task 3 (tools 필드 유지)
- 3.4 `a` 토글 → Task 5 (`toggleMode`), Task 6 (키 바인딩)
- 3.5 노드 선택 + 디테일 → Task 5 (`renderDetail`), Task 6 (↑↓ 핸들러)
- 3.6 `parentToolUseID` 기반 → Task 2, 3
- 5.1 TreeNode 스키마 → Task 3 (`makeNode`)
- 5.3 매핑 규칙 → Task 3 (main/nested 분기 + orphan fallback)
- 6.x UI 레이아웃 → Task 5
- 7 엣지케이스: orphan (Task 3 테스트), 빈 폴더(Task 4 로더), 선택 노드 사라짐(Task 5 `renderTree` cursor 복원)
- 8 테스트 전략 → Task 1, 3

**Placeholder scan:** 없음.

**Type consistency:** TreeNode 필드명 `buildTree`/`makeNode`/`renderTree`/`renderDetail` 간 일치(`id`, `kind`, `agentType`, `description`, `parentId`, `toolUseId`, `depth`, `isRunning`, `startTime`, `endTime`, `elapsedMs`, `model`, `tokensIn`, `tokensOut`, `tools`, `diagnostics`, `children`).

**범위 외 항목** (Task 없이 spec Non-Goals):
- 비용 누적, export, 검색/필터, DAG, hook 시스템 — 모두 이번 plan에서 제외 ✓
