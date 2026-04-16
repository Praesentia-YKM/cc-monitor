# Recap Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** JSONL의 compact_boundary 이벤트와 직후 recap summary 텍스트를 파싱하여, Overview 탭에 Recap 전용 패널로 표시한다.

**Architecture:** session-parser.js에서 compact_boundary + recap 텍스트를 함께 파싱하고, 새 recap-panel.js UI 컴포넌트가 이를 렌더링한다. 기존 패널 패턴(createXxxPanel/updateXxxPanel)을 동일하게 따른다. Skill 패널과 Cost 패널 사이에 배치한다.

**Tech Stack:** Node.js, blessed (TUI library), 기존 cc-monitor 패턴 준수

---

### Task 1: recap-parser.js — JSONL에서 compaction 데이터 파싱

**Files:**
- Create: `src/parsers/recap-parser.js`

**Step 1: 파서 구현**

```javascript
const { readJsonlIncremental } = require('../utils/jsonl-reader');
const { parseTimestamp, formatTime } = require('../utils/time-format');

function parseRecaps(jsonlPath) {
  const entries = readJsonlIncremental(jsonlPath);
  const recaps = [];
  let pendingBoundary = null;

  for (const entry of entries) {
    if (entry.type === 'system' && entry.subtype === 'compact_boundary') {
      pendingBoundary = {
        timestamp: entry.timestamp,
        timeStr: entry.timestamp ? formatTime(parseTimestamp(entry.timestamp)) : '',
        preTokens: entry.compactMetadata?.preTokens || 0,
        postTokens: entry.compactMetadata?.postTokens || 0,
        durationMs: entry.compactMetadata?.durationMs || 0,
        trigger: entry.compactMetadata?.trigger || 'auto',
        summary: null,
        userMessages: [],
        pendingTasks: '',
        currentWork: '',
      };
      continue;
    }

    if (pendingBoundary
      && entry.type === 'user'
      && typeof entry.message?.content === 'string'
      && entry.message.content.includes('This session is being continued')) {

      const content = entry.message.content;
      pendingBoundary.summary = extractSection(content, 'Primary Request and Intent');
      pendingBoundary.userMessages = extractUserMessages(content);
      pendingBoundary.pendingTasks = extractSection(content, 'Pending Tasks');
      pendingBoundary.currentWork = extractSection(content, 'Current Work');
      recaps.push(pendingBoundary);
      pendingBoundary = null;
      continue;
    }

    // boundary 뒤에 recap이 아닌 다른 엔트리가 오면 boundary만 기록
    if (pendingBoundary && entry.type !== 'progress') {
      recaps.push(pendingBoundary);
      pendingBoundary = null;
    }
  }

  if (pendingBoundary) {
    recaps.push(pendingBoundary);
  }

  return recaps;
}

function extractSection(content, sectionName) {
  const regex = new RegExp(`\\d+\\.\\s+${escapeRegex(sectionName)}:\\s*\\n([\\s\\S]*?)(?=\\n\\d+\\.|$)`);
  const match = content.match(regex);
  if (!match) return '';
  return match[1].trim().substring(0, 500);
}

function extractUserMessages(content) {
  const section = extractSection(content, 'All User Messages');
  if (!section) return [];
  const msgs = [];
  const regex = /- "(.+?)"/g;
  let m;
  while ((m = regex.exec(section)) !== null) {
    msgs.push(m[1].substring(0, 80));
  }
  return msgs;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { parseRecaps };
```

**Step 2: git add**

```bash
git add src/parsers/recap-parser.js
```

---

### Task 2: recap-panel.js — UI 컴포넌트

**Files:**
- Create: `src/ui/recap-panel.js`

**Step 1: 패널 UI 구현**

기존 skill-panel.js 패턴을 따른다. scrollable로 만들어서 긴 recap도 스크롤 가능하게 한다.

```javascript
const { createSection } = require('./layout');
const { formatTokenCount } = require('../utils/time-format');
const config = require('../config');
const I = config.ICONS;

const RECAP_ICON = '\u21BB'; // ↻

function createRecapPanel(screen, top) {
  const box = createSection({
    parent: screen,
    top,
    left: 0,
    width: '100%',
    height: 6,
    label: ` ${RECAP_ICON} Recap `,
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { style: { bg: 'gray' } },
  });
  return box;
}

function updateRecapPanel(box, recaps) {
  if (!recaps || recaps.length === 0) {
    box.setContent('{gray-fg}  (no compaction yet){/gray-fg}');
    return 0;
  }

  const lines = [];

  lines.push(`  {yellow-fg}{bold}Compactions: ${recaps.length}{/bold}{/yellow-fg}`);

  for (let i = recaps.length - 1; i >= 0; i--) {
    const r = recaps[i];
    const tokenInfo = r.preTokens > 0
      ? `{gray-fg}${formatTokenCount(r.preTokens)} \u2192 ${formatTokenCount(r.postTokens)}{/gray-fg}`
      : '';
    const durInfo = r.durationMs > 0
      ? `{gray-fg}(${(r.durationMs / 1000).toFixed(0)}s){/gray-fg}`
      : '';

    lines.push(`  {cyan-fg}${r.timeStr}{/cyan-fg} ${tokenInfo} ${durInfo}`);

    if (r.userMessages.length > 0) {
      const msgPreview = r.userMessages.slice(0, 3).map(m =>
        `    {gray-fg}\u2022{/gray-fg} ${truncate(m, 60)}`
      );
      lines.push(...msgPreview);
      if (r.userMessages.length > 3) {
        lines.push(`    {gray-fg}... +${r.userMessages.length - 3} more{/gray-fg}`);
      }
    }

    if (r.currentWork) {
      lines.push(`  {green-fg}Current:{/green-fg} ${truncate(r.currentWork.split('\n')[0], 55)}`);
    }

    if (r.pendingTasks) {
      lines.push(`  {yellow-fg}Pending:{/yellow-fg} ${truncate(r.pendingTasks.split('\n')[0], 55)}`);
    }
  }

  box.setContent(lines.join('\n'));
  return lines.length;
}

function truncate(str, maxLen) {
  if (!str) return '';
  const oneLine = str.replace(/\n/g, ' ').trim();
  return oneLine.length > maxLen ? oneLine.substring(0, maxLen) + '\u2026' : oneLine;
}

module.exports = { createRecapPanel, updateRecapPanel };
```

**Step 2: git add**

```bash
git add src/ui/recap-panel.js
```

---

### Task 3: app.js — Recap 패널 통합

**Files:**
- Modify: `src/app.js`

**Step 1: import 추가 (상단)**

```javascript
// 기존 import들 사이에 추가
const { createRecapPanel, updateRecapPanel } = require('./ui/recap-panel');
const { parseRecaps } = require('./parsers/recap-parser');
```

**Step 2: 패널 생성 (skillPanel과 costPanel 사이)**

기존:
```javascript
  const skillPanel = createSkillPanel(screen, 18);
  overviewPanels.push(skillPanel);

  const costPanel = createCostPanel(screen);
  overviewPanels.push(costPanel);
```

변경:
```javascript
  const skillPanel = createSkillPanel(screen, 18);
  overviewPanels.push(skillPanel);

  const recapPanel = createRecapPanel(screen, 24);
  overviewPanels.push(recapPanel);

  const costPanel = createCostPanel(screen);
  overviewPanels.push(costPanel);
```

**Step 3: refresh() 내 Overview 탭 렌더링에 recap 추가**

기존 (skillPanel.top 동적 계산 뒤):
```javascript
      skillPanel.top = 12 + subHeight;

      const skills = parseSkillHistory(session.sessionId);
      updateSkillPanel(skillPanel, skills);

      const cost = parseCost();
      updateCostPanel(costPanel, cost);
```

변경:
```javascript
      skillPanel.top = 12 + subHeight;

      const skills = parseSkillHistory(session.sessionId);
      updateSkillPanel(skillPanel, skills);

      const recaps = parseRecaps(jsonlInfo.jsonlPath);
      const recapLines = updateRecapPanel(recapPanel, recaps) || 1;
      const recapHeight = Math.max(4, Math.min(recapLines + 2, 12));
      recapPanel.height = recapHeight;
      recapPanel.top = skillPanel.top + (skillPanel.height || 6);

      const cost = parseCost();
      updateCostPanel(costPanel, cost);
```

주의: skillPanel은 `bottom: 4`로 설정되어 있어서 고정 height가 없다. recapPanel을 costPanel 바로 위에 배치하기 위해, skillPanel의 bottom을 recap 높이만큼 올리고 recapPanel을 costPanel 위에 놓는 방식으로 조정한다.

실제 레이아웃 조정:
```javascript
      // skillPanel의 bottom을 recapPanel 높이 + costPanel 높이만큼 확보
      const recaps = parseRecaps(jsonlInfo.jsonlPath);
      const recapLines = updateRecapPanel(recapPanel, recaps) || 1;
      const recapHeight = Math.max(4, Math.min(recapLines + 2, 12));
      recapPanel.height = recapHeight;
      recapPanel.bottom = 1 + 3;  // statusBar(1) + costPanel(3)
      skillPanel.bottom = 1 + 3 + recapHeight;  // statusBar + cost + recap
```

**Step 4: 빈 세션 / no-JSONL 분기에서 recapPanel 클리어 추가**

`activeSessions.length === 0` 분기:
```javascript
        recapPanel.setContent('');
```

`!jsonlInfo` 분기:
```javascript
        recapPanel.setContent('');
```

**Step 5: 동작 확인**

```bash
# cc-monitor 재시작
cc-monitor
```

Expected: Overview 탭에서 Skill 패널과 Cost 패널 사이에 "↻ Recap" 패널이 표시됨. compaction이 있는 세션에서는 compaction 횟수, 토큰 변화, 사용자 메시지 요약이 보임.

---

### Task 4: config.js — ICONS에 recap 아이콘 추가

**Files:**
- Modify: `src/config.js`

**Step 1: ICONS 객체에 recap 추가**

```javascript
    recap: '\u21BB',    // ↻
```

**Step 2: recap-panel.js에서 config.ICONS 사용으로 변경**

```javascript
// 하드코딩된 RECAP_ICON 제거, config.ICONS.recap 사용
const label = ` ${I.recap} Recap `;
```

---

### Task 5: help-overlay.js — 도움말에 Recap 패널 설명 추가

**Files:**
- Modify: `src/ui/help-overlay.js`

**Step 1: Overview 패널 설명에 Recap 추가**

help 텍스트에 아래 내용 추가:
```
Recap     - Context compaction history & conversation summary
```
