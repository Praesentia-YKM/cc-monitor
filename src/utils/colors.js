const config = require('../config');

function contextColor(pct) {
  if (pct >= 90) return config.COLORS.error;
  if (pct >= config.CONTEXT_WARN_THRESHOLD * 100) return config.COLORS.warn;
  return config.COLORS.success;
}

function agentStatusColor(isRunning) {
  return isRunning ? config.COLORS.running : config.COLORS.completed;
}

function costColor(amount) {
  if (amount >= 50) return config.COLORS.error;
  if (amount >= 20) return config.COLORS.warn;
  return config.COLORS.success;
}

function contextBar(pct, width) {
  const filled = Math.round((pct / 100) * width);
  const empty = width - filled;
  const color = contextColor(pct);
  const fill = config.ICONS.context.repeat(filled);
  const blank = config.ICONS.contextEmpty.repeat(empty);
  return `{${color}-fg}${fill}{/${color}-fg}{gray-fg}${blank}{/gray-fg}`;
}

module.exports = { contextColor, agentStatusColor, costColor, contextBar };
