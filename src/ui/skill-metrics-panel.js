const { createSection } = require('./layout');
const config = require('../config');
const I = config.ICONS;

const STATE_META = {
  active:  { icon: '🟢', label: 'active',  color: 'green-fg'   },
  dormant: { icon: '🟡', label: 'dormant', color: 'yellow-fg'  },
  dead:    { icon: '🔴', label: 'dead',    color: 'red-fg'     },
  unused:  { icon: '⚫', label: 'unused',  color: 'gray-fg'    },
  new:     { icon: '🆕', label: 'new',     color: 'cyan-fg'    },
  unknown: { icon: '❓', label: '?',       color: 'gray-fg'    },
};

function createMetricsSummaryPanel(screen) {
  return createSection({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 5,
    label: ` ${I.session} Skill Metrics Summary `,
    tags: true,
  });
}

function createMetricsTablePanel(screen) {
  return createSection({
    parent: screen,
    top: 5,
    left: 0,
    width: '100%',
    height: '100%-7',
    label: ` ${I.folder} Skill Call Table `,
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { style: { bg: 'cyan' } },
    mouse: true,
    keys: false,
  });
}

function pad(str, width) {
  const s = String(str);
  const visibleLen = s.replace(/[^\x00-\x7F]/g, 'xx').length; // 한글 2폭 가정
  const diff = width - visibleLen;
  return diff > 0 ? s + ' '.repeat(diff) : s;
}

function formatTs(iso) {
  if (!iso) return '—';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso;
  const pad2 = n => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())} ${pad2(t.getHours())}:${pad2(t.getMinutes())}`;
}

function updateMetricsSummaryPanel(box, data) {
  if (!data) { box.setContent('{gray-fg}(loading){/gray-fg}'); return; }
  const { summary } = data;

  if (!summary.logExists) {
    box.setContent([
      '  {yellow-fg}⚠ skill-calls.jsonl 없음{/yellow-fg}',
      '  {gray-fg}PostToolUse 훅(skill-tracker.mjs)이 Skill 호출을 기록 중.{/gray-fg}',
      '  {gray-fg}최초 Skill 호출 후 나타납니다.{/gray-fg}',
    ].join('\n'));
    return;
  }

  const { counts, totalCalls, firstTs, lastTs, excludedCount } = summary;
  const sep = `  {gray-fg}${I.separator}{/gray-fg}  `;

  const line1 = `{green-fg}🟢 active{/green-fg} {bold}${counts.active}{/bold}`
    + sep + `{yellow-fg}🟡 dormant{/yellow-fg} {bold}${counts.dormant}{/bold}`
    + sep + `{red-fg}🔴 dead{/red-fg} {bold}${counts.dead}{/bold}`
    + sep + `{gray-fg}⚫ unused{/gray-fg} {bold}${counts.unused}{/bold}`
    + sep + `{cyan-fg}🆕 new{/cyan-fg} {bold}${counts.new}{/bold}`;

  const range = firstTs && lastTs
    ? `${formatTs(firstTs)} ~ ${formatTs(lastTs)}`
    : '—';
  const line2 = `{gray-fg}로그:{/gray-fg} ${range}`
    + sep + `{gray-fg}총 호출:{/gray-fg} {bold}${totalCalls}{/bold}`
    + sep + `{gray-fg}제외:{/gray-fg} ${excludedCount}`;

  box.setContent(`${line1}\n${line2}`);
}

function updateMetricsTablePanel(box, data) {
  if (!data) { box.setContent('{gray-fg}(loading){/gray-fg}'); return; }
  const { rows } = data;

  if (rows.length === 0) {
    box.setContent('  {gray-fg}(집계할 스킬이 없습니다){/gray-fg}');
    return;
  }

  const headerCols = [
    pad('상태', 10),
    pad('스킬명', 38),
    pad('마지막 호출', 16),
    pad('호출', 6),
    pad('manual%', 8),
    '출처',
  ].join('  ');
  const divider = '─'.repeat(Math.min((box.width || 100) - 4, 98));

  const lines = [
    `  {bold}${headerCols}{/bold}`,
    `  {gray-fg}${divider}{/gray-fg}`,
  ];

  for (const r of rows) {
    const meta = STATE_META[r.state] || STATE_META.unknown;
    const stateCell = pad(`${meta.icon} ${meta.label}`, 10);
    const nameCell = pad(r.name, 38);
    const lastCell = pad(r.state === 'unused' ? `설치 ${r.ageDays}일` : r.lastRel, 16);
    const countCell = pad(r.count, 6);
    const manualCell = pad(r.count > 0 ? `${r.manualPct}%` : '—', 8);
    const srcCell = r.isCustom ? 'custom' : 'plugin';

    const coloredName = `{${meta.color}}${nameCell}{/${meta.color}}`;
    const warn = r.count > 0 && r.manualPct === 0 ? ' {red-fg}auto only{/red-fg}' : '';

    lines.push(`  ${stateCell}  ${coloredName}  {gray-fg}${lastCell}{/gray-fg}  ${countCell}  ${manualCell}  {gray-fg}${srcCell}{/gray-fg}${warn}`);
  }

  box.setContent(lines.join('\n'));
}

module.exports = {
  createMetricsSummaryPanel,
  createMetricsTablePanel,
  updateMetricsSummaryPanel,
  updateMetricsTablePanel,
};
