const { createSection } = require('./layout');
const config = require('../config');
const { EVENT_TYPES } = require('../constants/event-types');
const I = config.ICONS;

const EVENT_STYLE = {
  [EVENT_TYPES.USER_MSG]:       { icon: '\u25B6', color: 'cyan',   tag: 'USER' },
  [EVENT_TYPES.ASSISTANT_MSG]:  { icon: '\u25C0', color: 'white',  tag: 'AI' },
  [EVENT_TYPES.HOOK_SUCCESS]:   { icon: '\u2713', color: 'green',  tag: 'HOOK' },
  [EVENT_TYPES.HOOK_CANCELLED]: { icon: '\u2717', color: 'gray',   tag: 'HOOK' },
  [EVENT_TYPES.RULE_LOADED]:    { icon: '\u2630', color: 'yellow', tag: 'RULE' },
  [EVENT_TYPES.MEMORY_LOADED]:  { icon: '\u2605', color: 'magenta', tag: 'MEM' },
  [EVENT_TYPES.SKILL_LISTED]:   { icon: '\u2261', color: 'blue',   tag: 'SKILL' },
  [EVENT_TYPES.SKILL_CALLED]:   { icon: '\u2726', color: 'green',  tag: 'SKILL' },
  [EVENT_TYPES.TOOL_USE]:       { icon: '\u25AA', color: 'white',  tag: 'TOOL' },
  [EVENT_TYPES.COMPACT]:        { icon: '\u21BB', color: 'red',    tag: 'RECAP' },
};

function createFlowSummaryPanel(screen) {
  const box = createSection({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 5,
    label: ` ${I.session} Flow Summary `,
    tags: true,
  });
  return box;
}

function updateFlowSummaryPanel(box, summary) {
  const sep = `  {gray-fg}${I.separator}{/gray-fg}  `;

  const line1 = `{gray-fg}Events{/gray-fg} {bold}${summary.totalEvents}{/bold}`
    + sep + `{green-fg}${I.agentDone} Hooks{/green-fg} {bold}${summary.hooksSuccess}{/bold}`
    + (summary.hooksCancelled > 0 ? ` {gray-fg}(${summary.hooksCancelled} skipped){/gray-fg}` : '')
    + sep + `{yellow-fg}\u2630 Rules{/yellow-fg} {bold}${summary.rules}{/bold}`
    + sep + `{magenta-fg}${I.skill} Memory{/magenta-fg} {bold}${summary.memories}{/bold}`;

  const line2 = `{gray-fg}Skills{/gray-fg} {bold}${summary.skillCalls}{/bold}`
    + sep + `{cyan-fg}User msgs{/cyan-fg} {bold}${summary.userMsgs}{/bold}`
    + (summary.compactions > 0
      ? sep + `{red-fg}\u21BB Compactions{/red-fg} {bold}${summary.compactions}{/bold}`
      : '');

  box.setContent(`${line1}\n${line2}`);
}

function createFlowTimelinePanel(screen) {
  const box = createSection({
    parent: screen,
    top: 5,
    left: 0,
    width: '100%',
    height: '100%-7',
    label: ` ${I.folder} Flow Timeline `,
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      style: { bg: 'cyan' },
    },
    mouse: true,
    keys: false,
  });
  return box;
}

function groupConsecutiveHooks(events) {
  const result = [];
  let i = 0;

  while (i < events.length) {
    const ev = events[i];

    if (ev.type === EVENT_TYPES.HOOK_CANCELLED) {
      const group = { tools: {}, count: 0, firstTime: ev.timeStr, lastTime: ev.timeStr };
      while (i < events.length && events[i].type === EVENT_TYPES.HOOK_CANCELLED) {
        const label = events[i].label || 'unknown';
        const toolName = label.includes(':') ? label.split(':').pop() : label;
        group.tools[toolName] = (group.tools[toolName] || 0) + 1;
        group.count++;
        group.lastTime = events[i].timeStr;
        i++;
      }
      result.push({ _grouped: true, ...group });
    } else {
      result.push(ev);
      i++;
    }
  }
  return result;
}

function updateFlowTimelinePanel(box, events, scrollToBottom) {
  if (!events || events.length === 0) {
    box.setContent('{gray-fg}  (no events yet){/gray-fg}');
    return;
  }

  const grouped = groupConsecutiveHooks(events);
  const lines = [];
  let lastMsgIdx = null;

  for (const item of grouped) {
    if (item._grouped) {
      const toolSummary = Object.entries(item.tools)
        .sort((a, b) => b[1] - a[1])
        .map(([name, cnt]) => `${name}:${cnt}`)
        .join(' ');
      const time = item.firstTime ? `{gray-fg}${item.firstTime}{/gray-fg}` : '        ';
      lines.push(`  ${time}  {gray-fg}\u2717 [HOOK ] PostToolUse x${item.count} (${toolSummary}){/gray-fg}`);
      continue;
    }

    const event = item;
    const style = EVENT_STYLE[event.type] || { icon: '?', color: 'white', tag: '???' };

    if (event.type === EVENT_TYPES.COMPACT) {
      lines.push('');
      lines.push(`{red-fg}  ${'═'.repeat(70)}{/red-fg}`);
      const time = event.timeStr ? `{gray-fg}${event.timeStr}{/gray-fg}` : '        ';
      lines.push(`  ${time}  {red-fg}{bold}\u21BB [RECAP] Context Compaction{/bold}{/red-fg}  {yellow-fg}${event.label}{/yellow-fg}`);
      lines.push(`{red-fg}  ${'═'.repeat(70)}{/red-fg}`);
      lines.push('');
      continue;
    }

    if (event.type === EVENT_TYPES.USER_MSG && lastMsgIdx !== null) {
      lines.push(`{gray-fg}  ${'─'.repeat(70)}{/gray-fg}`);
    }
    if (event.type === EVENT_TYPES.USER_MSG) {
      lastMsgIdx = event.msgIndex;
    }

    const time = event.timeStr ? `{gray-fg}${event.timeStr}{/gray-fg}` : '        ';
    const icon = `{${style.color}-fg}${style.icon}{/${style.color}-fg}`;
    const tag = `{${style.color}-fg}[${style.tag.padEnd(5)}]{/${style.color}-fg}`;

    let label = event.label || '';
    if (event.type === EVENT_TYPES.USER_MSG) {
      if (event.isCommand) {
        label = `{gray-fg}#${event.msgIndex} ${label}{/gray-fg}`;
      } else {
        label = `{bold}{cyan-fg}#${event.msgIndex}{/cyan-fg}{/bold} ${label}`;
      }
    } else if (event.type === EVENT_TYPES.HOOK_SUCCESS) {
      label = `{green-fg}{bold}${event.hookEvent || ''}{/bold}{/green-fg} ${event.label}`;
    } else if (event.type === EVENT_TYPES.HOOK_CANCELLED) {
      label = `{gray-fg}${label}{/gray-fg}`;
    } else if (event.type === EVENT_TYPES.RULE_LOADED) {
      label = `{yellow-fg}${label}{/yellow-fg}`;
    } else if (event.type === EVENT_TYPES.MEMORY_LOADED) {
      label = `{magenta-fg}${label}{/magenta-fg}`;
    } else if (event.type === EVENT_TYPES.SKILL_CALLED) {
      label = `{green-fg}{bold}/${label}{/bold}{/green-fg}`;
    }

    lines.push(`  ${time}  ${icon} ${tag} ${label}`);
  }

  box.setContent(lines.join('\n'));

  if (scrollToBottom) {
    box.setScrollPerc(100);
  }
}

function createFlowFilterBar(screen) {
  const box = createSection({
    parent: screen,
    bottom: 1,
    left: 0,
    width: '100%',
    height: 3,
    label: ' Filter ',
    tags: true,
  });
  return box;
}

function updateFlowFilterBar(box, activeFilters) {
  const filters = [
    { key: 'h', label: 'Hooks', type: 'hook', color: 'green' },
    { key: 'f', label: 'Rules', type: 'rule', color: 'yellow' },
    { key: 'm', label: 'Memory', type: 'memory', color: 'magenta' },
    { key: 's', label: 'Skills', type: 'skill', color: 'green' },
    { key: 'u', label: 'User', type: 'user', color: 'cyan' },
  ];

  const parts = filters.map(f => {
    const active = activeFilters.has(f.type);
    const indicator = active ? `{${f.color}-fg}{bold}${I.agent}{/bold}{/${f.color}-fg}` : `{gray-fg}${I.task}{/gray-fg}`;
    return `${indicator} {bold}${f.key}{/bold}:${f.label}`;
  });

  box.setContent(parts.join('  '));
}

module.exports = {
  createFlowSummaryPanel, updateFlowSummaryPanel,
  createFlowTimelinePanel, updateFlowTimelinePanel,
  createFlowFilterBar, updateFlowFilterBar,
};
