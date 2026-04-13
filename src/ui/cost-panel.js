const { createSection } = require('./layout');
const { costColor } = require('../utils/colors');
const config = require('../config');
const I = config.ICONS;

function createCostPanel(screen) {
  const box = createSection({
    parent: screen,
    bottom: 1,
    left: 0,
    width: '100%',
    height: 3,
    label: ` ${I.cost} Cost `,
    tags: true,
  });
  return box;
}

function updateCostPanel(box, cost) {
  if (!cost.hasData) {
    box.setContent('{gray-fg}  (cost data not available){/gray-fg}');
    return;
  }

  const today = cost.todayTotal;
  const session = cost.sessionTotal;
  const color = costColor(today);
  const todayStr = `$${today.toFixed(2)}`;
  const sessionStr = `$${session.toFixed(2)}`;

  const warn = today >= 50
    ? `  {${config.COLORS.error}-fg}${I.warn} High!{/${config.COLORS.error}-fg}`
    : today >= 20
      ? `  {${config.COLORS.warn}-fg}${I.warn} Moderate{/${config.COLORS.warn}-fg}`
      : '';

  box.setContent(
    `  {gray-fg}Today{/gray-fg} {${color}-fg}{bold}${todayStr}{/bold}{/${color}-fg}`
    + `  {gray-fg}${I.separator}{/gray-fg}  `
    + `{gray-fg}Session{/gray-fg} {bold}${sessionStr}{/bold}`
    + warn
  );
}

module.exports = { createCostPanel, updateCostPanel };
