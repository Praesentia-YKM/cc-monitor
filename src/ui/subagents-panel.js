const { createSection } = require('./layout');
const { formatDuration, formatTokenCount } = require('../utils/time-format');
const { formatModelTag } = require('../utils/format-model');
const config = require('../config');
const I = config.ICONS;

function createSubagentsPanel(screen, top) {
  const box = createSection({
    parent: screen,
    top,
    left: 0,
    width: '100%',
    height: 6,
    label: ` ${I.agent} Subagents `,
    tags: true,
    scrollable: true,
  });
  return box;
}


function bottleneckIndicator(agent) {
  const totalTools = Object.values(agent.tools).reduce((s, c) => s + c, 0);
  const readCount = agent.tools['Read'] || 0;
  const grepCount = agent.tools['Grep'] || 0;
  const globCount = agent.tools['Glob'] || 0;
  const searchCount = readCount + grepCount + globCount;

  // 경고 조건 판별
  if (agent.isRunning && agent.elapsedMs > 5 * 60 * 1000) {
    return `{red-fg}${I.warn} slow(${formatDuration(agent.elapsedMs)}){/red-fg}`;
  }
  if (totalTools > 30 && searchCount / totalTools > 0.7) {
    return `{yellow-fg}${I.warn} search-heavy(${searchCount}/${totalTools}){/yellow-fg}`;
  }
  if (agent.tokensIn > 500000) {
    return `{yellow-fg}${I.warn} high-tokens{/yellow-fg}`;
  }
  return '';
}

function updateSubagentsPanel(box, agents) {
  if (!agents || agents.length === 0) {
    box.setContent('{gray-fg}(no subagents){/gray-fg}');
    return;
  }

  const running = agents.filter(a => a.isRunning).length;
  const done = agents.length - running;
  const totalTokensIn = agents.reduce((s, a) => s + a.tokensIn, 0);
  const totalTokensOut = agents.reduce((s, a) => s + a.tokensOut, 0);

  const summary = `{gray-fg}Total:{/gray-fg} {bold}${agents.length}{/bold}  `
    + (running > 0 ? `{green-fg}${I.agent} Running: ${running}{/green-fg}  ` : '')
    + (done > 0 ? `{gray-fg}${I.agentDone} Done: ${done}{/gray-fg}  ` : '')
    + `{gray-fg}${I.token}{/gray-fg} In:{bold}${formatTokenCount(totalTokensIn)}{/bold} Out:{bold}${formatTokenCount(totalTokensOut)}{/bold}`;

  const lines = [summary];
  agents.slice(0, 8).forEach(a => {
    const icon = a.isRunning
      ? `{green-fg}${I.agent}{/green-fg}`
      : `{gray-fg}${I.agentDone}{/gray-fg}`;
    const type = a.type.length > 14 ? a.type.substring(0, 14) : a.type;
    const dur = formatDuration(a.elapsedMs).padStart(7);
    const modelStr = formatModelTag(a.model);

    // 도구 사용 요약 (상위 3개)
    const toolEntries = Object.entries(a.tools).sort((x, y) => y[1] - x[1]);
    const toolStr = toolEntries.slice(0, 3).map(([n, c]) => `${n}:${c}`).join(' ');

    const tokenStr = `{gray-fg}${formatTokenCount(a.tokensIn)}/${formatTokenCount(a.tokensOut)}{/gray-fg}`;

    const warn = bottleneckIndicator(a);
    const maxDesc = 30;
    const desc = a.description.length > maxDesc ? a.description.substring(0, maxDesc) + '\u2026' : a.description;

    lines.push(
      `  ${icon} {bold}${type}{/bold}  ${modelStr}  {cyan-fg}${dur}{/cyan-fg}`
      + `  ${tokenStr}  {gray-fg}${toolStr}{/gray-fg}`
      + (warn ? `  ${warn}` : '')
      + `  {gray-fg}${desc}{/gray-fg}`
    );
  });

  box.setContent(lines.join('\n'));
}

module.exports = { createSubagentsPanel, updateSubagentsPanel };
