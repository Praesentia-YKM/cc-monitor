const DEFAULT_MAX_CONTEXT = 200000;
const ONE_MILLION_CONTEXT = 1000000;

function shortModelName(model) {
  if (!model) return '';
  return model.replace('claude-', '').replace(/\[1m\]$/, '').replace(/-1m$/, '').replace(/-\d{8}$/, '');
}

function formatModelTag(model) {
  const short = shortModelName(model);
  if (!short) return '';
  if (short.includes('haiku')) return `{blue-fg}haiku{/blue-fg}`;
  if (short.includes('sonnet')) return `{yellow-fg}sonnet{/yellow-fg}`;
  if (short.includes('opus')) return `{magenta-fg}opus{/magenta-fg}`;
  return `{gray-fg}${short}{/gray-fg}`;
}

function getMaxContext(model) {
  if (!model) return DEFAULT_MAX_CONTEXT;
  if (/\[1m\]$/.test(model) || /-1m$/.test(model)) return ONE_MILLION_CONTEXT;
  return DEFAULT_MAX_CONTEXT;
}

module.exports = { shortModelName, formatModelTag, getMaxContext, DEFAULT_MAX_CONTEXT };
