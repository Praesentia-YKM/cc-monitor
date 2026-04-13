const { createSection } = require('./layout');
const config = require('../config');
const I = config.ICONS;

function createSkillPanel(screen, top) {
  const box = createSection({
    parent: screen,
    top,
    left: 0,
    width: '100%',
    bottom: 4,
    label: ` ${I.skill} Recent Activity `,
    tags: true,
    scrollable: true,
  });
  return box;
}

function updateSkillPanel(box, skills) {
  if (!skills || skills.length === 0) {
    box.setContent('{gray-fg}(no recent activity){/gray-fg}');
    return;
  }

  const lines = skills.slice(0, 6).map((s, i) => {
    const icon = i === 0
      ? `{green-fg}${I.skill}{/green-fg}`
      : `{gray-fg} {/gray-fg}`;
    const time = `{cyan-fg}${s.timeStr}{/cyan-fg}`;
    const name = i === 0 ? `{bold}${s.name}{/bold}` : `{gray-fg}${s.name}{/gray-fg}`;
    return `  ${icon} ${time}  ${name}`;
  });

  box.setContent(lines.join('\n'));
}

module.exports = { createSkillPanel, updateSkillPanel };
