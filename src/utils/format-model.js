function shortModelName(model) {
  if (!model) return '';
  return model.replace('claude-', '').replace(/-\d{8}$/, '');
}

function formatModelTag(model) {
  const short = shortModelName(model);
  if (!short) return '';
  if (short.includes('haiku')) return `{blue-fg}haiku{/blue-fg}`;
  if (short.includes('sonnet')) return `{yellow-fg}sonnet{/yellow-fg}`;
  if (short.includes('opus')) return `{magenta-fg}opus{/magenta-fg}`;
  return `{gray-fg}${short}{/gray-fg}`;
}

module.exports = { shortModelName, formatModelTag };
