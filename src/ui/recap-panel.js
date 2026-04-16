const { createSection } = require('./layout');
const { formatTokenCount } = require('../utils/time-format');
const config = require('../config');
const I = config.ICONS;

function createRecapPanel(screen) {
  const box = createSection({
    parent: screen,
    top: 24,
    left: 0,
    width: '100%',
    height: 3,
    label: ` ${I.recap} Recap `,
    tags: true,
    scrollable: true,
  });
  return box;
}

function updateRecapPanel(box, recaps) {
  if (!recaps || recaps.length === 0) {
    box.setContent('{gray-fg}  (no compaction yet){/gray-fg}');
    return 1;
  }

  const lines = [];

  for (let i = recaps.length - 1; i >= 0; i--) {
    const r = recaps[i];
    const tokenInfo = r.preTokens > 0
      ? `${formatTokenCount(r.preTokens)}\u2192${formatTokenCount(r.postTokens)}`
      : '';
    const durInfo = r.durationMs > 0 ? `(${(r.durationMs / 1000).toFixed(0)}s)` : '';
    const idx = `{yellow-fg}#${recaps.length - i}{/yellow-fg}`;

    lines.push(`  ${idx} {cyan-fg}${r.timeStr}{/cyan-fg} {gray-fg}${tokenInfo} ${durInfo}{/gray-fg}`);

    const maxWidth = (box.width || 80) - 6;

    if (r.userMessages.length > 0) {
      r.userMessages.slice(0, 5).forEach(m => {
        lines.push(`    {gray-fg}\u2022{/gray-fg} ${truncate(m, maxWidth - 6)}`);
      });
      if (r.userMessages.length > 5) {
        lines.push(`    {gray-fg}... +${r.userMessages.length - 5} more{/gray-fg}`);
      }
    }

    if (r.currentWork) {
      lines.push(`  {green-fg}Work:{/green-fg} ${truncate(r.currentWork.split('\n')[0], maxWidth - 8)}`);
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
