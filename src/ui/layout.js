const blessed = require('blessed');
const config = require('../config');

function createScreen() {
  return blessed.screen({
    smartCSR: true,
    title: 'Claude Code Monitor',
    fullUnicode: true,
  });
}

function createSection(options) {
  return blessed.box({
    border: { type: 'line' },
    style: {
      border: { fg: config.COLORS.border },
      label: { fg: config.COLORS.title, bold: true },
    },
    ...options,
  });
}

module.exports = { createScreen, createSection };
