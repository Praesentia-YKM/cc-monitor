function countTools(tools, content) {
  if (!Array.isArray(content)) return;
  for (const block of content) {
    if (block.type === 'tool_use' && block.name) {
      tools[block.name] = (tools[block.name] || 0) + 1;
    }
  }
}

module.exports = { countTools };
