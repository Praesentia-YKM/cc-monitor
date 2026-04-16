const { createSection } = require('./layout');
const config = require('../config');
const I = config.ICONS;

function createSkillPanel(screen, top) {
  const box = createSection({
    parent: screen,
    top,
    left: 0,
    width: '100%',
    height: 6,
    label: ` ${I.msg} Recent Conversation `,
    tags: true,
    scrollable: true,
  });
  return box;
}

function truncate(str, maxLen) {
  if (!str) return '';
  const oneLine = str.replace(/\n/g, ' ').trim();
  return oneLine.length > maxLen ? oneLine.substring(0, maxLen) + '\u2026' : oneLine;
}

function updateSkillPanel(box, conversations) {
  if (!conversations || conversations.length === 0) {
    box.setContent('{gray-fg}(no conversation yet){/gray-fg}');
    return;
  }

  const lines = [];
  const recent = conversations.slice(-5).reverse();

  recent.forEach((c, i) => {
    const time = `{cyan-fg}${c.timeStr}{/cyan-fg}`;
    const userIcon = i === 0 ? `{green-fg}${I.tool}{/green-fg}` : `{gray-fg}${I.tool}{/gray-fg}`;
    const userText = i === 0
      ? `{bold}${truncate(c.userText, 55)}{/bold}`
      : `${truncate(c.userText, 55)}`;
    lines.push(`  ${userIcon} ${time} ${userText}`);
    lines.push(`    {gray-fg}\u25C0 ${truncate(c.aiText, 58)}{/gray-fg}`);
  });

  box.setContent(lines.join('\n'));
  return lines.length;
}

module.exports = { createSkillPanel, updateSkillPanel };
