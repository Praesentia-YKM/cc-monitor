const config = require('./config');
const { createScreen } = require('./ui/layout');
const { createHeader, updateHeader } = require('./ui/header');
const { createToolsPanel, updateToolsPanel } = require('./ui/tools-panel');
const { createSubagentsPanel, updateSubagentsPanel } = require('./ui/subagents-panel');
const { createSkillPanel, updateSkillPanel } = require('./ui/skill-panel');
const { createCostPanel, updateCostPanel } = require('./ui/cost-panel');
const { createStatusBar, updateStatusBar } = require('./ui/status-bar');
const {
  createFlowSummaryPanel, updateFlowSummaryPanel,
  createFlowTimelinePanel, updateFlowTimelinePanel,
  createFlowFilterBar, updateFlowFilterBar,
} = require('./ui/flow-panel');

const { findActiveSessions, findSessionJsonl } = require('./parsers/session-finder');
const { parseSession, calcContextPercent, calcIdleTime, calcAge } = require('./parsers/session-parser');
const { parseSubagents } = require('./parsers/subagent-parser');
const { parseSkillHistory } = require('./parsers/history-parser');
const { parseCost } = require('./parsers/cost-parser');
const { parseFlowEvents, buildFlowSummary } = require('./parsers/flow-parser');
const { EVENT_TYPES } = require('./constants/event-types');
const { resetCache } = require('./utils/jsonl-reader');
const { createHelpOverlay } = require('./ui/help-overlay');
const { saveName, getName } = require('./utils/session-names');
const logger = require('./utils/logger');

function createApp(options = {}) {
  logger.init(options.debug);
  logger.log('info', 'App starting', { debug: !!options.debug });

  const screen = createScreen();

  // === Tab 1: Overview ===
  // Layout: Header(0~6) → Tools(7~11) → Subagents(12~17) → Skills(18~bottom:4) → Cost(bottom:1, h:3) → StatusBar(bottom:0)
  const overviewPanels = [];

  const header = createHeader(screen);
  overviewPanels.push(header.box);

  const toolsPanel = createToolsPanel(screen, 7);
  overviewPanels.push(toolsPanel);

  const subagentsPanel = createSubagentsPanel(screen, 12);
  overviewPanels.push(subagentsPanel);

  const skillPanel = createSkillPanel(screen, 18);
  overviewPanels.push(skillPanel);

  const costPanel = createCostPanel(screen);
  overviewPanels.push(costPanel);

  // === Tab 2: Flow ===
  const flowPanels = [];

  const flowSummary = createFlowSummaryPanel(screen);
  flowPanels.push(flowSummary);

  const flowTimeline = createFlowTimelinePanel(screen);
  flowPanels.push(flowTimeline);

  const flowFilterBar = createFlowFilterBar(screen);
  flowPanels.push(flowFilterBar);

  // === Rename prompt ===
  const blessed = require('blessed');
  const renamePrompt = blessed.textbox({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 50,
    height: 3,
    hidden: true,
    tags: true,
    border: { type: 'line' },
    style: {
      border: { fg: 'yellow' },
      bg: 'black',
      fg: 'white',
    },
    label: ' Session Name (ESC=cancel, Enter=save) ',
    inputOnFocus: true,
  });
  let renameActive = false;

  // === Help overlay ===
  const helpOverlay = createHelpOverlay(screen);
  let helpVisible = false;

  // === Status bar (shared) ===
  const statusBar = createStatusBar(screen);

  // === State ===
  let currentTab = 1; // 1=Overview, 2=Flow
  let currentSessionIdx = 0;
  let activeSessions = [];
  let allFlowEvents = [];
  const flowFilters = new Set(['hook', 'rule', 'memory', 'skill', 'user']);

  function showTab(tab) {
    currentTab = tab;
    const showOverview = tab === 1;
    overviewPanels.forEach(p => { p.hidden = !showOverview; });
    flowPanels.forEach(p => { p.hidden = showOverview; });
    screen.render();
  }

  // Start with tab 1
  showTab(1);

  function getFilteredFlowEvents() {
    return allFlowEvents.filter(e => {
      if (e.type === EVENT_TYPES.USER_MSG) return flowFilters.has('user');
      if (e.type === EVENT_TYPES.HOOK_SUCCESS || e.type === EVENT_TYPES.HOOK_CANCELLED) return flowFilters.has('hook');
      if (e.type === EVENT_TYPES.RULE_LOADED) return flowFilters.has('rule');
      if (e.type === EVENT_TYPES.MEMORY_LOADED) return flowFilters.has('memory');
      if (e.type === EVENT_TYPES.SKILL_LISTED || e.type === EVENT_TYPES.SKILL_CALLED) return flowFilters.has('skill');
      return true;
    });
  }

  function toggleFilter(filterType) {
    if (flowFilters.has(filterType)) {
      flowFilters.delete(filterType);
    } else {
      flowFilters.add(filterType);
    }
    updateFlowFilterBar(flowFilterBar, flowFilters);
    updateFlowTimelinePanel(flowTimeline, getFilteredFlowEvents(), false);
    screen.render();
  }

  function refresh() {
    activeSessions = findActiveSessions();

    if (activeSessions.length === 0) {
      if (currentTab === 1) {
        header.box.setContent('{center}{bold}No active Claude Code sessions found.{/bold}{/center}\n\n{center}{gray-fg}Start a session and this monitor will detect it automatically.{/gray-fg}{/center}');
        toolsPanel.setContent('');
        subagentsPanel.setContent('');
        skillPanel.setContent('');
        costPanel.setContent('');
      } else {
        flowSummary.setContent('{center}{bold}No active sessions.{/bold}{/center}');
        flowTimeline.setContent('');
      }
      updateStatusBar(statusBar, config.POLL_INTERVAL_MS, 0, 0, currentTab);
      screen.render();
      return;
    }

    if (currentSessionIdx >= activeSessions.length) {
      currentSessionIdx = 0;
    }

    const session = activeSessions[currentSessionIdx];
    const jsonlInfo = findSessionJsonl(session);

    if (!jsonlInfo) {
      const msg = `Session ${session.sessionId.substring(0, 8)} found but no JSONL data yet.`;
      if (currentTab === 1) {
        header.box.setContent(`{center}${msg}{/center}`);
      } else {
        flowSummary.setContent(`{center}${msg}{/center}`);
      }
      screen.render();
      return;
    }

    if (currentTab === 1) {
      // Overview tab
      const sessionData = parseSession(jsonlInfo.jsonlPath);
      const contextPct = calcContextPercent(sessionData);
      const idleMs = calcIdleTime(sessionData);
      const ageMs = calcAge(session, sessionData);

      updateHeader(header, session, sessionData, contextPct, ageMs, idleMs, activeSessions, currentSessionIdx);
      updateToolsPanel(toolsPanel, sessionData.tools);

      const agents = parseSubagents(jsonlInfo.projectDir, session.sessionId);
      updateSubagentsPanel(subagentsPanel, agents);

      const skills = parseSkillHistory(session.sessionId);
      updateSkillPanel(skillPanel, skills);

      const cost = parseCost();
      updateCostPanel(costPanel, cost);
    } else {
      // Flow tab
      allFlowEvents = parseFlowEvents(jsonlInfo.jsonlPath);
      const summary = buildFlowSummary(allFlowEvents);
      updateFlowSummaryPanel(flowSummary, summary);
      updateFlowTimelinePanel(flowTimeline, getFilteredFlowEvents(), true);
      updateFlowFilterBar(flowFilterBar, flowFilters);
    }

    updateStatusBar(statusBar, config.POLL_INTERVAL_MS, activeSessions.length, currentSessionIdx, currentTab);

    screen.render();
  }

  function toggleHelp() {
    helpVisible = !helpVisible;
    helpOverlay.hidden = !helpVisible;
    if (helpVisible) {
      helpOverlay.setFront();
      helpOverlay.focus();
      helpOverlay.setScrollPerc(0);
    } else {
      screen.focusPop();
    }
    screen.render();
  }

  // Key bindings
  function quit() {
    clearInterval(pollTimer);
    logger.close();
    screen.destroy();
    process.exit(0);
  }

  screen.key(['q'], () => {
    if (renameActive) return;
    if (helpVisible) { toggleHelp(); return; }
    quit();
  });

  screen.key(['escape'], () => {
    if (renameActive) return;
    if (helpVisible) { toggleHelp(); return; }
    quit();
  });

  screen.key(['?'], () => { toggleHelp(); });

  screen.key(['r'], () => {
    if (helpVisible) return;
    resetCache();
    refresh();
  });

  screen.key(['1'], () => {
    if (helpVisible) return;
    showTab(1);
    refresh();
  });

  screen.key(['2'], () => {
    if (helpVisible) return;
    showTab(2);
    refresh();
  });

  screen.key(['up'], () => {
    if (helpVisible) { helpOverlay.scroll(-3); screen.render(); return; }
    if (currentTab === 2) {
      flowTimeline.scroll(-3);
      screen.render();
      return;
    }
    if (activeSessions.length > 1) {
      currentSessionIdx = (currentSessionIdx - 1 + activeSessions.length) % activeSessions.length;
      resetCache();
      refresh();
    }
  });

  screen.key(['down'], () => {
    if (helpVisible) { helpOverlay.scroll(3); screen.render(); return; }
    if (currentTab === 2) {
      flowTimeline.scroll(3);
      screen.render();
      return;
    }
    if (activeSessions.length > 1) {
      currentSessionIdx = (currentSessionIdx + 1) % activeSessions.length;
      resetCache();
      refresh();
    }
  });

  // Flow filter keys (only active on tab 2, not during help)
  screen.key(['h'], () => { if (!helpVisible && currentTab === 2) toggleFilter('hook'); });
  screen.key(['f'], () => { if (!helpVisible && currentTab === 2) toggleFilter('rule'); });
  screen.key(['m'], () => { if (!helpVisible && currentTab === 2) toggleFilter('memory'); });
  screen.key(['s'], () => { if (!helpVisible && currentTab === 2) toggleFilter('skill'); });
  screen.key(['u'], () => { if (!helpVisible && currentTab === 2) toggleFilter('user'); });

  // Rename session
  screen.key(['n'], () => {
    if (helpVisible || renameActive) return;
    if (activeSessions.length === 0) return;

    renameActive = true;
    const session = activeSessions[currentSessionIdx];
    const currentName = getName(session.sessionId) || '';
    renamePrompt.hidden = false;
    renamePrompt.setValue(currentName);
    renamePrompt.setFront();
    renamePrompt.focus();
    renamePrompt.readInput(() => {});
    screen.render();
  });

  renamePrompt.on('submit', (value) => {
    const session = activeSessions[currentSessionIdx];
    if (session) {
      saveName(session.sessionId, value || '');
    }
    renamePrompt.hidden = true;
    renameActive = false;
    screen.focusPop();
    refresh();
  });

  renamePrompt.on('cancel', () => {
    renamePrompt.hidden = true;
    renameActive = false;
    screen.focusPop();
    screen.render();
  });

  // Initial render + polling
  refresh();
  const pollTimer = setInterval(refresh, config.POLL_INTERVAL_MS);

  screen.render();
}

module.exports = { createApp };
