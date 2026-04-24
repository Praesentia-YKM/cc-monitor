const { createSection } = require('./layout');
const config = require('../config');
const { formatDuration, formatTokenCount, formatTime } = require('../utils/time-format');
const I = config.ICONS;

// type별 고정 색상 매핑 — 4개 서브패널에서 같은 agent는 같은 색으로 보이게 함.
const TYPE_PALETTE = ['cyan', 'green', 'magenta', 'yellow', 'blue', 'red', 'white'];
const typeColorCache = new Map();
typeColorCache.set('main', 'white');

function colorForType(type) {
  if (!type) return 'gray';
  if (typeColorCache.has(type)) return typeColorCache.get(type);
  let h = 0;
  for (let i = 0; i < type.length; i++) h = (h * 31 + type.charCodeAt(i)) >>> 0;
  const color = TYPE_PALETTE[h % TYPE_PALETTE.length];
  typeColorCache.set(type, color);
  return color;
}

function createTeamsPanels(screen) {
  const gantt = createSection({
    parent: screen,
    top: 0, left: 0, width: '100%', height: '40%',
    label: ' ⏱  작업 타임라인 (Agent Gantt) ',
    tags: true, scrollable: true, alwaysScroll: true,
    scrollbar: { ch: '█', style: { bg: 'cyan' }, track: { bg: 'black' } },
  });

  const flow = createSection({
    parent: screen,
    top: '40%', left: 0, width: '100%', height: '30%',
    label: ' \u{1F500}  호출 플로우 (Orchestration Flow) ',
    tags: true, scrollable: true, alwaysScroll: true,
    scrollbar: { ch: '█', style: { bg: 'cyan' }, track: { bg: 'black' } },
  });

  const load = createSection({
    parent: screen,
    top: '70%', left: 0, width: '50%', height: '30%-1',
    label: ' \u{1F4CA}  팀 작업량 (Team Load) ',
    tags: true, scrollable: true,
  });

  const heat = createSection({
    parent: screen,
    top: '70%', left: '50%', width: '50%', height: '30%-1',
    label: ' \u{1F525}  병목 히트맵 (Bottleneck) ',
    tags: true, scrollable: true,
  });

  return {
    boxes: [gantt, flow, load, heat],
    gantt, flow, load, heat,
  };
}

function updateTeamsPanels(panels, metrics) {
  updateGantt(panels.gantt, metrics.gantt);
  updateFlow(panels.flow, metrics.flow);
  updateLoad(panels.load, metrics.load);
  updateHeat(panels.heat, metrics.heat);
}

// ── 1. Gantt ────────────────────────────────────────────────────────────
function updateGantt(box, gantt) {
  if (!gantt.items || gantt.items.length === 0) {
    box.setContent('{gray-fg}  (에이전트 실행 기록 없음 — Agent 도구로 서브에이전트를 호출하면 여기 나타납니다){/gray-fg}');
    return;
  }

  const panelWidth = typeof box.width === 'number' ? box.width : 100;
  const LABEL_W = 14;
  const META_W = 26; // "1h 02m · running" 같은 꼬리
  const BAR_W = Math.max(20, panelWidth - LABEL_W - META_W - 4);

  const spanMs = Math.max(1, gantt.maxMs - gantt.minMs);
  const msPerCell = spanMs / BAR_W;

  const lines = [];

  for (const it of gantt.items) {
    const offsetCells = Math.floor((it.startMs - gantt.minMs) / msPerCell);
    const durationCells = Math.max(1, Math.round((it.endMs - it.startMs) / msPerCell));
    const tailCells = Math.max(0, BAR_W - offsetCells - durationCells);

    const color = colorForType(it.type);
    const bar =
      `{gray-fg}${'░'.repeat(offsetCells)}{/gray-fg}` +
      `{${color}-fg}${'█'.repeat(durationCells)}{/${color}-fg}` +
      `{gray-fg}${'░'.repeat(tailCells)}{/gray-fg}`;

    const label = truncate(it.label, LABEL_W).padEnd(LABEL_W);
    const elapsedStr = formatDuration(it.endMs - it.startMs).padStart(8);
    const statusStr = it.isRunning
      ? ` {green-fg}running{/green-fg}`
      : ` {gray-fg}done{/gray-fg}   `;

    lines.push(`{${color}-fg}${label}{/${color}-fg} ${bar} ${elapsedStr}${statusStr}`);

    if (it.description) {
      const desc = truncate(it.description, panelWidth - LABEL_W - 4);
      lines.push(`${' '.repeat(LABEL_W)} {gray-fg}"${desc}"{/gray-fg}`);
    }
  }

  // 시간축
  lines.push('');
  lines.push(renderTimeAxis(gantt.minMs, gantt.maxMs, BAR_W, LABEL_W));

  box.setContent(lines.join('\n'));
}

function renderTimeAxis(minMs, maxMs, barW, labelW) {
  const start = formatTime(new Date(minMs));
  const end = formatTime(new Date(maxMs));
  const axis = `${'─'.repeat(barW)}`;
  const pad = ' '.repeat(labelW + 1);
  return `${pad}{gray-fg}${axis}{/gray-fg}\n${pad}{gray-fg}${start}${' '.repeat(Math.max(1, barW - start.length - end.length))}${end}{/gray-fg}`;
}

// ── 2. Orchestration Flow ──────────────────────────────────────────────
function updateFlow(box, flowGroups) {
  if (!flowGroups || flowGroups.length === 0) {
    box.setContent('{gray-fg}  (호출 관계 없음){/gray-fg}');
    return;
  }

  const lines = [];
  for (const group of flowGroups) {
    const pColor = colorForType(group.parentLabel);
    lines.push(`{${pColor}-fg}{bold}${I.session} ${group.parentLabel}{/bold}{/${pColor}-fg}`);

    for (let i = 0; i < group.children.length; i++) {
      const c = group.children[i];
      const isLast = i === group.children.length - 1;
      const branch = isLast ? '└─▶' : '├─▶';
      const cColor = colorForType(c.type);

      const marker = c.isRunning
        ? `{green-fg}${I.agent}{/green-fg}`
        : (c.hasError ? `{red-fg}${I.warn}{/red-fg}` : `{gray-fg}${I.agentDone}{/gray-fg}`);

      const elapsed = c.elapsedMs ? formatDuration(c.elapsedMs) : '-';
      const status = c.isRunning ? '{green-fg}running{/green-fg}' : '{gray-fg}done{/gray-fg}';

      const desc = c.description ? ` {gray-fg}"${c.description}"{/gray-fg}` : '';
      lines.push(`  {gray-fg}${branch}{/gray-fg} ${marker} {${cColor}-fg}{bold}${c.type}{/bold}{/${cColor}-fg}${desc}  {cyan-fg}${I.clock} ${elapsed}{/cyan-fg}  ${status}`);
    }

    lines.push('');
  }

  box.setContent(lines.join('\n'));
}

// ── 3. Team Load ───────────────────────────────────────────────────────
function updateLoad(box, loadData) {
  if (!loadData || loadData.length === 0) {
    box.setContent('{gray-fg}  (데이터 없음){/gray-fg}');
    return;
  }

  const panelWidth = typeof box.width === 'number' ? box.width : 50;
  const LABEL_W = 14;
  const BAR_W = Math.max(6, Math.min(18, panelWidth - LABEL_W - 28));

  const maxMs = loadData.reduce((m, x) => Math.max(m, x.totalMs), 1);
  const lines = [
    '{gray-fg}  타입별 호출 수 · 누적 시간 · 토큰 · 도구 호출{/gray-fg}',
    '',
  ];

  for (const L of loadData) {
    const color = colorForType(L.type);
    const filled = Math.max(1, Math.round((L.totalMs / maxMs) * BAR_W));
    const empty = BAR_W - filled;
    const bar = `{${color}-fg}${'█'.repeat(filled)}{/${color}-fg}{gray-fg}${'░'.repeat(empty)}{/gray-fg}`;

    const label = truncate(L.type, LABEL_W).padEnd(LABEL_W);
    const runningMark = L.runningCount > 0 ? `{green-fg}●${L.runningCount}{/green-fg}` : '  ';
    const meta = `{bold}${L.count}회{/bold} {gray-fg}·{/gray-fg} ${formatDuration(L.totalMs)} {gray-fg}·{/gray-fg} ${formatTokenCount(L.tokensIn + L.tokensOut)}tok {gray-fg}·{/gray-fg} ${L.toolCalls}t`;

    lines.push(`{${color}-fg}${label}{/${color}-fg} ${bar} ${runningMark} ${meta}`);
  }

  box.setContent(lines.join('\n'));
}

// ── 4. Bottleneck Heatmap ──────────────────────────────────────────────
function updateHeat(box, heatData) {
  if (!heatData || heatData.length === 0) {
    box.setContent('{gray-fg}  (데이터 없음){/gray-fg}');
    return;
  }

  const panelWidth = typeof box.width === 'number' ? box.width : 50;
  const LABEL_W = 14;
  const BAR_W = Math.max(8, Math.min(20, panelWidth - LABEL_W - 22));

  const lines = [
    '{gray-fg}  활성도 (도구 호출/분) — 낮으면 대기·병목 가능성{/gray-fg}',
    '',
  ];

  for (const h of heatData) {
    const color = colorForType(h.type);
    const activeCells = Math.max(0, Math.round(h.activePct * BAR_W));
    const idleCells = BAR_W - activeCells;
    const bar = `{${color}-fg}${'█'.repeat(activeCells)}{/${color}-fg}{gray-fg}${'▒'.repeat(idleCells)}{/gray-fg}`;

    const label = truncate(h.type, LABEL_W).padEnd(LABEL_W);
    const density = `${h.density.toFixed(1)}t/m`.padStart(7);

    let tag;
    if (h.stalled) {
      tag = ' {red-fg}{bold}멈춤?{/bold}{/red-fg}';
    } else if (h.hasError) {
      tag = ` {red-fg}${I.warn}err{/red-fg}`;
    } else if (h.isRunning) {
      tag = ' {green-fg}active{/green-fg}';
    } else {
      tag = ' {gray-fg}done{/gray-fg}  ';
    }

    lines.push(`{${color}-fg}${label}{/${color}-fg} ${bar} {cyan-fg}${density}{/cyan-fg}${tag}`);
  }

  box.setContent(lines.join('\n'));
}

function truncate(s, maxLen) {
  if (!s) return '';
  if (s.length <= maxLen) return s;
  if (maxLen <= 1) return s.substring(0, maxLen);
  return s.substring(0, maxLen - 1) + '…';
}

module.exports = { createTeamsPanels, updateTeamsPanels, colorForType };
