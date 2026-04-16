const blessed = require('blessed');
const { createSection } = require('./layout');
const { formatDuration, formatTokenCount, formatTime } = require('../utils/time-format');
const { contextColor, contextBar } = require('../utils/colors');
const { getName } = require('../utils/session-names');
const { shortModelName } = require('../utils/format-model');
const config = require('../config');
const I = config.ICONS;

function createHeader(screen) {
  const box = createSection({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 7,
    label: ` ${I.session} Claude Code Monitor `,
    tags: true,
  });

  const clockLabel = blessed.text({
    parent: box,
    top: 0,
    right: 1,
    content: '',
    tags: true,
  });

  return { box, clockLabel };
}

function sessionDisplayName(session) {
  const customName = getName(session.sessionId);
  if (customName) return customName;
  const cwd = session.cwd || '';
  return cwd.split(/[/\\]/).pop() || cwd;
}

function getCwdFolder(session) {
  const cwd = session.cwd || '';
  return cwd.split(/[/\\]/).pop() || cwd;
}

function formatSessionNav(allSessions, currentIdx) {
  if (!allSessions || allSessions.length <= 1) return [];

  // cwd별 그룹 구성
  const groups = [];
  let lastCwd = null;
  for (let i = 0; i < allSessions.length; i++) {
    const cwd = getCwdFolder(allSessions[i]);
    if (cwd !== lastCwd) {
      groups.push({ cwd, sessions: [] });
      lastCwd = cwd;
    }
    groups[groups.length - 1].sessions.push(i);
  }

  const lines = [];
  for (const group of groups) {
    const parts = group.sessions.map(i => {
      const s = allSessions[i];
      const name = sessionDisplayName(s);
      const sid = (s.sessionId || '').substring(0, 4);
      const age = s.startedAt ? formatDuration(Date.now() - new Date(s.startedAt).getTime()) : '';

      if (i === currentIdx) {
        return `{white-bg}{black-fg} ${sid} ${age} {/black-fg}{/white-bg}`;
      }
      const customName = getName(s.sessionId);
      const label = customName ? `"${customName}"` : sid;
      return `{gray-fg}${label}{/gray-fg}`;
    });

    const cwdLabel = `{cyan-fg}${group.cwd}{/cyan-fg}`;
    lines.push(`  ${cwdLabel}  ${parts.join('  ')}`);
  }

  return lines;
}

function updateHeader(header, session, sessionData, contextPct, ageMs, idleMs, allSessions, currentIdx) {
  const model = sessionData.model || 'unknown';
  const shortModel = shortModelName(model) || model;
  const cwd = session.cwd || '';
  const sid = (session.sessionId || '').substring(0, 8);
  const customName = getName(session.sessionId);

  const ctxColor = contextColor(contextPct);
  const bar = contextBar(contextPct, 20);
  const ctxWarn = contextPct >= 80 ? ` {${config.COLORS.warn}-fg}${I.warn} compaction soon{/${config.COLORS.warn}-fg}` : '';

  const navLines = formatSessionNav(allSessions, currentIdx);

  const lines = [];

  if (navLines.length > 0) {
    lines.push(`{gray-fg}Sessions (${allSessions.length})  [\u2191\u2193 switch  n:rename]{/gray-fg}`);
    lines.push(...navLines);
    lines.push('');
  }

  lines.push(`{cyan-fg}${I.folder} ${cwd}{/cyan-fg}`);

  const namePart = customName
    ? `{yellow-fg}{bold}"${customName}"{/bold}{/yellow-fg}  `
    : '';
  lines.push(
    `${namePart}{gray-fg}Session{/gray-fg} {bold}${sid}{/bold}  `
    + `{gray-fg}${I.model} Model{/gray-fg} {bold}${shortModel}{/bold}  `
    + `{gray-fg}${I.clock} Age{/gray-fg} {bold}${formatDuration(ageMs)}{/bold}  `
    + `{gray-fg}${I.idle} Idle{/gray-fg} {bold}${formatDuration(idleMs)}{/bold}`
  );
  lines.push(`{gray-fg}Context{/gray-fg} ${bar} {${ctxColor}-fg}{bold}${contextPct}%{/bold}{/${ctxColor}-fg}${ctxWarn}`);
  lines.push(
    `{gray-fg}${I.msg} Msgs{/gray-fg} U:{bold}${sessionData.userMessages}{/bold} A:{bold}${sessionData.assistantMessages}{/bold}`
  );
  lines.push(
    `{gray-fg}${I.token} Tokens{/gray-fg} In:{bold}${formatTokenCount(sessionData.tokens.input)}{/bold} `
    + `Out:{bold}${formatTokenCount(sessionData.tokens.output)}{/bold} `
    + `CW:{bold}${formatTokenCount(sessionData.tokens.cacheWrite)}{/bold} `
    + `CR:{bold}${formatTokenCount(sessionData.tokens.cacheRead)}{/bold}`
  );

  const neededHeight = lines.length + 2;
  if (header.box.height !== neededHeight) {
    header.box.height = neededHeight;
  }

  header.box.setContent(lines.join('\n'));
  header.clockLabel.setContent(`{cyan-fg}${formatTime(new Date())}{/cyan-fg}`);
}

module.exports = { createHeader, updateHeader };
