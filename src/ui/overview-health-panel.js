const { createSection } = require('./layout');
const config = require('../config');

function severityRank(s) {
  return s === 'critical' ? 2 : s === 'warning' ? 1 : 0;
}

function signalIcon(type) {
  if (type === 'internal-error') return '⚠';
  if (type === 'stalled') return '⏸';
  if (type === 'retry-loop') return '♻';
  return '·';
}

function createHealthPanel(parent, opts = {}) {
  const box = createSection({
    parent,
    label: ' ⚕ Sub-agent Health ',
    border: 'line',
    tags: true,
    ...opts
  });

  function render(allSubagents) {
    if (!allSubagents || allSubagents.length === 0) {
      box.setContent('  No active sub-agents');
      return;
    }
    const buckets = { ok: 0, warning: 0, critical: 0 };
    const issues = [];
    for (const s of allSubagents) {
      const h = s.health || { status: 'ok', signals: [] };
      if (buckets[h.status] !== undefined) buckets[h.status]++;
      for (const sig of h.signals) {
        issues.push({ subagent: s, signal: sig });
      }
    }
    if (buckets.warning === 0 && buckets.critical === 0) {
      box.setContent(`  {green-fg}⚕ All OK{/green-fg} (${buckets.ok} sub-agents healthy)`);
      return;
    }
    issues.sort((a, b) => severityRank(b.signal.severity) - severityRank(a.signal.severity));
    const top = issues.slice(0, config.healthAnalyzer.topIssuesCount || 3);
    const lines = [
      `  {green-fg}✓ OK: ${buckets.ok}{/green-fg}   {red-fg}⚠ Critical: ${buckets.critical}{/red-fg}   {yellow-fg}⏸ Warning: ${buckets.warning}{/yellow-fg}`,
      `  Top issues:`
    ];
    for (const issue of top) {
      const color = issue.signal.severity === 'critical' ? 'red-fg' : 'yellow-fg';
      const icon = signalIcon(issue.signal.type);
      const agentLabel = (issue.subagent.agentType || issue.subagent.type || 'unknown').padEnd(20);
      lines.push(`    {${color}}${icon}{/${color}} ${agentLabel} ${issue.signal.message.slice(0, 60)}`);
    }
    box.setContent(lines.join('\n'));
  }

  return { box, render };
}

module.exports = { createHealthPanel };
