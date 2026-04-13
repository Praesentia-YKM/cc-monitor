const { createSection } = require('./layout');
const config = require('../config');
const { EVENT_TYPES } = require('../parsers/flow-parser');
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
  const line1 = `{gray-fg}Events{/gray-fg} {bold}${summary.totalEvents}{/bold}  `
    + `{gray-fg}${I.separator}{/gray-fg}  `
    + `{green-fg}${I.agentDone} Hooks{/green-fg} {bold}${summary.hooksSuccess}{/bold}`
    + (summary.hooksCancelled > 0 ? ` {gray-fg}(${summary.hooksCancelled} skipped){/gray-fg}` : '')
    + `  {gray-fg}${I.separator}{/gray-fg}  `
    + `{yellow-fg}\u2630 Rules{/yellow-fg} {bold}${summary.rules}{/bold}`
    + `  {gray-fg}${I.separator}{/gray-fg}  `
    + `{magenta-fg}${I.skill} Memory{/magenta-fg} {bold}${summary.memories}{/bold}`;

  const line2 = `{gray-fg}Skills{/gray-fg} {bold}${summary.skillCalls}{/bold}`
    + `  {gray-fg}${I.separator}{/gray-fg}  `
    + `{cyan-fg}User msgs{/cyan-fg} {bold}${summary.userMsgs}{/bold}`;

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
    keys: true,
    vi: true,
  });
  return box;
}

function updateFlowTimelinePanel(box, events, scrollToBottom) {
  if (!events || events.length === 0) {
    box.setContent('{gray-fg}  (no events yet){/gray-fg}');
    return;
  }

  const lines = [];
  let lastMsgIdx = null;

  for (const event of events) {
    const style = EVENT_STYLE[event.type] || { icon: '?', color: 'white', tag: '???' };

    // 사용자 메시지마다 구분선
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
