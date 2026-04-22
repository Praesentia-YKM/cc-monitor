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
    height: '30%-1',
    label: ' Details ',
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
      mode: 'recent',
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
  if (node.endTime) {
    const age = Date.now() - Date.parse(node.endTime);
    if (age < RECENT_MS) return `{blue-fg}${I.recap}{/blue-fg}`;
  }
  return `{gray-fg}${I.agentDone}{/gray-fg}`;
}

function filterFlatten(flatten, mode) {
  if (mode === 'all') return flatten;
  return flatten.filter(n => {
    if (n.kind === 'session') return true;
    if (n.isRunning) return true;
    if (n.endTime && Date.now() - Date.parse(n.endTime) < RECENT_MS) return true;
    return false;
  });
}

function buildTreePrefix(node, visibleMap) {
  if (node.depth === 0) return '';
  const chain = [];
  let cur = node;
  while (cur && cur.parentId) {
    const parentNode = visibleMap.get(cur.parentId);
    chain.unshift({ node: cur, parent: parentNode });
    cur = parentNode;
  }
  let prefix = '';
  for (let i = 0; i < chain.length; i++) {
    const { node: n, parent } = chain[i];
    if (!parent) break;
    const visibleSiblings = parent.children.filter(c => visibleMap.has(c.id));
    const isLast = visibleSiblings.length > 0 && visibleSiblings[visibleSiblings.length - 1].id === n.id;
    const isTerminal = i === chain.length - 1;
    if (isTerminal) {
      prefix += isLast ? '└─ ' : '├─ ';
    } else {
      prefix += isLast ? '   ' : '│  ';
    }
  }
  return prefix;
}

function topTools(toolsObj, limit = 4) {
  const entries = Object.entries(toolsObj || {}).sort((a, b) => b[1] - a[1]);
  return entries.slice(0, limit).map(([n, c]) => `${n}:${c}`).join(' ');
}

function indentForChildren(prefix) {
  // 노드 보조 라인(description, tools)에 맞는 들여쓰기
  // 트리 가지 표시 문자를 유지하되 분기 문자는 │/공백으로 대체
  return prefix.replace(/├─ /g, '│  ').replace(/└─ /g, '   ');
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

  const subPrefix = indentForChildren(prefix);

  if (node.kind === 'agent' && node.description) {
    const desc = node.description.length > 80
      ? node.description.substring(0, 80) + '…'
      : node.description;
    linesOut.push(`  ${subPrefix}    {gray-fg}"${desc}"{/gray-fg}`);
  }

  const toolStr = topTools(node.tools);
  if (toolStr) {
    linesOut.push(`  ${subPrefix}    {gray-fg}\u{1F6E0} ${toolStr}{/gray-fg}`);
  }

  return linesOut;
}

function renderTree(state, treeData) {
  const filtered = filterFlatten(treeData.flatten, state.mode);
  state.visibleFlatten = filtered;

  if (filtered.length === 0) {
    return '{gray-fg}(no agents visible){/gray-fg}';
  }

  const visibleMap = new Map();
  filtered.forEach(n => visibleMap.set(n.id, n));

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
    const prefix = buildTreePrefix(node, visibleMap);
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
    lines.push(`{bold}Selected:{/bold} ${node.agentType}  {gray-fg}(${(node.id || '').substring(0, 12)}){/gray-fg}`);
    lines.push(`{bold}Description:{/bold} ${node.description || '(none)'}`);
    const statusStr = node.isRunning ? '{green-fg}running{/green-fg}' : '{gray-fg}done{/gray-fg}';
    lines.push(`{bold}Status:{/bold} ${statusStr}  •  Started ${node.startTime || '?'}  •  Duration ${formatDuration(node.elapsedMs || 0)}`);
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
      lines.push(`  {red-fg}${I.warn} ${lastErr.substring(0, 120)}{/red-fg}`);
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
