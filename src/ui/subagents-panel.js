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

  if (agent.isRunning && agent.elapsedMs > 5 * 60 * 1000) {
    return `{red-fg}${I.warn} slow(${formatDuration(agent.elapsedMs)}){/red-fg}`;
  }
  if (totalTools > 30 && searchCount / totalTools > 0.7) {
    return `{yellow-fg}${I.warn} search-heavy(${searchCount}/${totalTools}){/yellow-fg}`;
  }
  if (agent.tokensIn > 2000000) {
    return `{yellow-fg}${I.warn} high-tokens(${formatTokenCount(agent.tokensIn)}){/yellow-fg}`;
  }
  return '';
}

function formatDiagnosticLines(diag, isRunning) {
  if (!diag || !isRunning) return [];

  const hasProblem = diag.repeatPattern || diag.deniedCount > 0 || diag.errors.length > 0;
  if (!hasProblem && !diag.lastActivityText) return [];

  const lines = [];

  if (diag.repeatPattern) {
    lines.push(`      {red-fg}${I.warn} LOOP  ${diag.repeatPattern.tool} x${diag.repeatPattern.count}{/red-fg}`);
  }
  if (diag.deniedCount > 0) {
    lines.push(`      {red-fg}${I.warn} DENY  x${diag.deniedCount}{/red-fg}`);
  }
  if (diag.errors.length > 0) {
    const errMsg = diag.errors[diag.errors.length - 1];
    const firstLine = errMsg.split('\n')[0].trim();
    lines.push(`      {yellow-fg}${I.warn} ERR(${diag.errors.length})  ${firstLine}{/yellow-fg}`);
  }
  if (diag.lastActivityText) {
    const firstLine = diag.lastActivityText.split('\n')[0].trim();
    lines.push(`      {gray-fg}${I.read} ${firstLine}{/gray-fg}`);
  }

  return lines;
}

function formatAgentLine(a) {
  const icon = a.isRunning
    ? `{green-fg}${I.agent}{/green-fg}`
    : `{gray-fg}${I.agentDone}{/gray-fg}`;
  const type = a.type.length > 16 ? a.type.substring(0, 16) : a.type;
  const dur = formatDuration(a.elapsedMs).padStart(7);
  const modelStr = formatModelTag(a.model);
  const toolEntries = Object.entries(a.tools).sort((x, y) => y[1] - x[1]);
  const toolStr = toolEntries.slice(0, 3).map(([n, c]) => `${n}:${c}`).join(' ');
  const tokenStr = `${formatTokenCount(a.tokensIn)}/${formatTokenCount(a.tokensOut)}`;
  const warn = bottleneckIndicator(a);
  const desc = a.description.length > 50 ? a.description.substring(0, 50) + '\u2026' : a.description;

  return `  ${icon} {bold}${type}{/bold}  ${modelStr}  {cyan-fg}${dur}{/cyan-fg}`
    + `  {gray-fg}${tokenStr}{/gray-fg}  {gray-fg}${toolStr}{/gray-fg}`
    + (warn ? `  ${warn}` : '')
    + `  {gray-fg}${desc}{/gray-fg}`;
}

function formatDoneSummary(doneAgents) {
  if (doneAgents.length === 0) return [];
  if (doneAgents.length <= 3) {
    return doneAgents.map(a => formatAgentLine(a));
  }

  const totalIn = doneAgents.reduce((s, a) => s + a.tokensIn, 0);
  const totalOut = doneAgents.reduce((s, a) => s + a.tokensOut, 0);
  const avgMs = doneAgents.reduce((s, a) => s + a.elapsedMs, 0) / doneAgents.length;
  const types = {};
  doneAgents.forEach(a => { types[a.type] = (types[a.type] || 0) + 1; });
  const typeStr = Object.entries(types).map(([t, c]) => c > 1 ? `${t} x${c}` : t).join(', ');

  return [
    `  {gray-fg}${I.agentDone} Done: ${doneAgents.length}  avg ${formatDuration(avgMs)}`
    + `  ${formatTokenCount(totalIn)}/${formatTokenCount(totalOut)}`
    + `  (${typeStr}){/gray-fg}`,
  ];
}

function updateSubagentsPanel(box, agents) {
  if (!agents || agents.length === 0) {
    box.setContent('{gray-fg}(no subagents){/gray-fg}');
    return 1;
  }

  const runningAgents = agents.filter(a => a.isRunning);
  const doneAgents = agents.filter(a => !a.isRunning);
  const totalTokensIn = agents.reduce((s, a) => s + a.tokensIn, 0);
  const totalTokensOut = agents.reduce((s, a) => s + a.tokensOut, 0);

  const summary = `{gray-fg}Total:{/gray-fg} {bold}${agents.length}{/bold}  `
    + (runningAgents.length > 0 ? `{green-fg}${I.agent} Running: ${runningAgents.length}{/green-fg}  ` : '')
    + (doneAgents.length > 0 ? `{gray-fg}${I.agentDone} Done: ${doneAgents.length}{/gray-fg}  ` : '')
    + `{gray-fg}${I.token}{/gray-fg} In:{bold}${formatTokenCount(totalTokensIn)}{/bold} Out:{bold}${formatTokenCount(totalTokensOut)}{/bold}`;

  const lines = [summary];

  runningAgents.forEach(a => {
    lines.push(formatAgentLine(a));
    const diagLines = formatDiagnosticLines(a.diagnostics, true);
    lines.push(...diagLines);
  });

  lines.push(...formatDoneSummary(doneAgents));

  box.setContent(lines.join('\n'));
  return lines.length;
}

module.exports = { createSubagentsPanel, updateSubagentsPanel };
