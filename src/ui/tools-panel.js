const { createSection } = require('./layout');
const config = require('../config');
const I = config.ICONS;

function createToolsPanel(screen, top) {
  const box = createSection({
    parent: screen,
    top,
    left: 0,
    width: '100%',
    height: 5,
    label: ` ${I.tool} Tools & Files `,
    tags: true,
    scrollable: true,
  });
  return box;
}

function updateToolsPanel(box, tools) {
  const sorted = Object.entries(tools).sort((a, b) => b[1] - a[1]);

  if (sorted.length === 0) {
    box.setContent('{gray-fg}  (no tool usage){/gray-fg}');
    return;
  }

  const total = sorted.reduce((sum, [, c]) => sum + c, 0);
  const editCount = (tools['Edit'] || 0) + (tools['Write'] || 0);
  const readCount = tools['Read'] || 0;
  const searchCount = (tools['Glob'] || 0) + (tools['Grep'] || 0);

  // Line 1: file activity summary bar
  const maxBar = 15;
  const maxVal = Math.max(editCount, readCount, searchCount, 1);
  const fileParts = [];
  if (readCount > 0) {
    const barLen = Math.max(1, Math.round((readCount / maxVal) * maxBar));
    fileParts.push(`${I.read}Read {cyan-fg}${'|'.repeat(barLen)}{/cyan-fg} {bold}${readCount}{/bold}`);
  }
  if (editCount > 0) {
    const barLen = Math.max(1, Math.round((editCount / maxVal) * maxBar));
    fileParts.push(`${I.edit}Write {green-fg}${'|'.repeat(barLen)}{/green-fg} {bold}${editCount}{/bold}`);
  }
  if (searchCount > 0) {
    const barLen = Math.max(1, Math.round((searchCount / maxVal) * maxBar));
    fileParts.push(`\u2026Search {yellow-fg}${'|'.repeat(barLen)}{/yellow-fg} {bold}${searchCount}{/bold}`);
  }

  // Line 2+: all tools with counts
  const toolParts = sorted.map(([name, count]) => {
    const pct = Math.round((count / total) * 100);
    return `${name}:{bold}${count}{/bold}{gray-fg}(${pct}%){/gray-fg}`;
  });

  const line1 = `  {gray-fg}Total:{/gray-fg} {bold}${total}{/bold} calls` + (fileParts.length > 0 ? `  ${I.separator}  ${fileParts.join('  ')}` : '');
  const line2 = `  ${toolParts.join('  ')}`;

  box.setContent(`${line1}\n${line2}`);
}

module.exports = { createToolsPanel, updateToolsPanel };
