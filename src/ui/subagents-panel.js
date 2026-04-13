const { createSection } = require('./layout');
const { formatDuration } = require('../utils/time-format');
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

function updateSubagentsPanel(box, agents) {
  if (!agents || agents.length === 0) {
    box.setContent('{gray-fg}(no subagents){/gray-fg}');
    return;
  }

  const running = agents.filter(a => a.isRunning).length;
  const done = agents.length - running;
  const summary = `{gray-fg}Total:{/gray-fg} {bold}${agents.length}{/bold}  `
    + (running > 0 ? `{green-fg}${I.agent} Running: ${running}{/green-fg}  ` : '')
    + (done > 0 ? `{gray-fg}${I.agentDone} Done: ${done}{/gray-fg}` : '');

  const lines = [summary];
  agents.slice(0, 6).forEach(a => {
    const icon = a.isRunning
      ? `{green-fg}${I.agent}{/green-fg}`
      : `{gray-fg}${I.agentDone}{/gray-fg}`;
    const type = `{bold}${a.type}{/bold}`.padEnd(22);
    const dur = formatDuration(a.elapsedMs).padStart(8);
    const maxLen = 50;
    const desc = a.description.length > maxLen ? a.description.substring(0, maxLen) + '\u2026' : a.description;
    lines.push(`  ${icon} ${type} {cyan-fg}${dur}{/cyan-fg}  ${desc}`);
  });

  box.setContent(lines.join('\n'));
}

module.exports = { createSubagentsPanel, updateSubagentsPanel };
