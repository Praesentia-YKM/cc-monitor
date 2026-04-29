const config = require('./config');
const { createScreen } = require('./ui/layout');
const { createHeader, updateHeader } = require('./ui/header');
const { createToolsPanel, updateToolsPanel } = require('./ui/tools-panel');
const { createSubagentsPanel, updateSubagentsPanel } = require('./ui/subagents-panel');
const { createHealthPanel } = require('./ui/overview-health-panel');
const { analyzeHealth } = require('./parsers/health-analyzer');
const { createSkillPanel, updateSkillPanel } = require('./ui/skill-panel');
const { createRecapPanel, updateRecapPanel } = require('./ui/recap-panel');
const { createCostPanel, updateCostPanel } = require('./ui/cost-panel');
const { createStatusBar, updateStatusBar } = require('./ui/status-bar');
const {
  createFlowSummaryPanel, updateFlowSummaryPanel,
  createFlowTimelinePanel, updateFlowTimelinePanel,
  createFlowFilterBar, updateFlowFilterBar,
} = require('./ui/flow-panel');

const {
  createConfigSummaryPanel, updateConfigSummaryPanel,
  createConfigTreePanel, updateConfigTreePanel,
} = require('./ui/config-panel');

const {
  createMetricsSummaryPanel, updateMetricsSummaryPanel,
  createMetricsTablePanel, updateMetricsTablePanel,
} = require('./ui/skill-metrics-panel');

const { createTreePanel, updateTreePanel, moveCursor: moveTreeCursor, toggleMode: toggleTreeMode } = require('./ui/tree-panel');
const { loadTreeData } = require('./parsers/tree-builder');

const { createTeamsPanels, updateTeamsPanels } = require('./ui/teams-panel');
const { buildTeamsMetrics } = require('./parsers/teams-metrics');

const { findActiveSessions, findSessionJsonl } = require('./parsers/session-finder');
const { parseSession, calcContextPercent, calcIdleTime, calcAge } = require('./parsers/session-parser');
const { parseSubagents } = require('./parsers/subagent-parser');
const { parseConversation } = require('./parsers/conversation-parser');
const { parseRecaps } = require('./parsers/recap-parser');
const { parseCost } = require('./parsers/cost-parser');
const { parseFlowEvents, buildFlowSummary } = require('./parsers/flow-parser');
const { parseConfig } = require('./parsers/config-parser');
const { parseSkillMetrics } = require('./parsers/skill-metrics-parser');
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
  // Layout: Header(0~6) → Tools(7~11) → Subagents(12~dyn) → Skills(dyn~bottom) → Recap(bottom:4, dyn h) → Cost(bottom:1, h:3) → StatusBar(bottom:0)
  const overviewPanels = [];

  const header = createHeader(screen);
  overviewPanels.push(header.box);

  const toolsPanel = createToolsPanel(screen, 7);
  overviewPanels.push(toolsPanel);

  const subagentsPanel = createSubagentsPanel(screen, 12);
  overviewPanels.push(subagentsPanel);

  const HEALTH_PANEL_HEIGHT = 6;
  const healthPanel = createHealthPanel(screen, {
    top: 12,
    left: 0,
    width: '100%',
    height: HEALTH_PANEL_HEIGHT,
  });
  overviewPanels.push(healthPanel.box);

  const skillPanel = createSkillPanel(screen, 18);
  overviewPanels.push(skillPanel);

  const recapPanel = createRecapPanel(screen);
  overviewPanels.push(recapPanel);

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

  // === Tab 3: Config ===
  const configPanels = [];

  const configSummary = createConfigSummaryPanel(screen);
  configPanels.push(configSummary);

  const configTree = createConfigTreePanel(screen);
  configPanels.push(configTree);

  // === Tab 4: Skill Metrics ===
  const metricsPanels = [];

  const metricsSummary = createMetricsSummaryPanel(screen);
  metricsPanels.push(metricsSummary);

  const metricsTable = createMetricsTablePanel(screen);
  metricsPanels.push(metricsTable);

  // === Tab 5: Tree ===
  const treePanel = createTreePanel(screen);
  const treePanels = treePanel.boxes;
  let latestTreeData = null;

  // === Tab 6: Teams ===
  const teamsPanel = createTeamsPanels(screen);
  const teamsPanels = teamsPanel.boxes;

  // === Rename prompt ===
  const blessed = require('neo-blessed');
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
  let lastRefreshAt = 0;
  const REFRESH_THROTTLE_MS = 800;
  const flowFilters = new Set(['hook', 'rule', 'memory', 'skill', 'user']);

  function fastClear() {
    const lines = screen.lines;
    const olines = screen.olines;
    const dattr = screen.dattr;
    for (let y = 0; y < lines.length; y++) {
      const line = lines[y];
      const oline = olines[y];
      for (let x = 0; x < line.length; x++) {
        line[x][0] = dattr;
        line[x][1] = ' ';
        oline[x][0] = dattr;
        oline[x][1] = ' ';
      }
      line.dirty = true;
    }
    screen.program.clear();
  }

  function showTab(tab) {
    if (currentTab === tab) {
      screen.render();
      return;
    }
    currentTab = tab;
    overviewPanels.forEach(p => { p.hidden = tab !== 1; });
    flowPanels.forEach(p => { p.hidden = tab !== 2; });
    configPanels.forEach(p => { p.hidden = tab !== 3; });
    metricsPanels.forEach(p => { p.hidden = tab !== 4; });
    treePanels.forEach(p => { p.hidden = tab !== 5; });
    teamsPanels.forEach(p => { p.hidden = tab !== 6; });
    fastClear();
    refresh();
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
    lastRefreshAt = Date.now();
    if (currentTab === 3) {
      const configData = parseConfig();
      updateConfigSummaryPanel(configSummary, configData);
      updateConfigTreePanel(configTree, configData);
      updateStatusBar(statusBar, config.POLL_INTERVAL_MS, 0, 0, currentTab);
      screen.render();
      return;
    }

    if (currentTab === 4) {
      const metricsData = parseSkillMetrics();
      updateMetricsSummaryPanel(metricsSummary, metricsData);
      updateMetricsTablePanel(metricsTable, metricsData);
      updateStatusBar(statusBar, config.POLL_INTERVAL_MS, 0, 0, currentTab);
      screen.render();
      return;
    }

    activeSessions = findActiveSessions();

    if (activeSessions.length === 0) {
      if (currentTab === 1) {
        header.box.setContent('{center}{bold}No active Claude Code sessions found.{/bold}{/center}\n\n{center}{gray-fg}Start a session and this monitor will detect it automatically.{/gray-fg}{/center}');
        toolsPanel.setContent('');
        subagentsPanel.setContent('');
        healthPanel.box.setContent('');
        skillPanel.setContent('');
        recapPanel.setContent('');
        costPanel.setContent('');
      } else if (currentTab === 2) {
        flowSummary.setContent('{center}{bold}No active sessions.{/bold}{/center}');
        flowTimeline.setContent('');
      } else if (currentTab === 5) {
        treePanel.treeBox.setContent('{center}{bold}No active sessions.{/bold}{/center}');
        treePanel.detailBox.setContent('');
      } else if (currentTab === 6) {
        teamsPanel.gantt.setContent('{center}{bold}No active sessions.{/bold}{/center}');
        teamsPanel.flow.setContent('');
        teamsPanel.load.setContent('');
        teamsPanel.heat.setContent('');
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
      // JSONL이 있는 다른 세션으로 fallback 시도
      let fallbackFound = false;
      for (let i = 0; i < activeSessions.length; i++) {
        if (i === currentSessionIdx) continue;
        const fallbackJsonl = findSessionJsonl(activeSessions[i]);
        if (fallbackJsonl) {
          currentSessionIdx = i;
          fallbackFound = true;
          return refresh();
        }
      }

      const msg = `Session ${session.sessionId.substring(0, 8)} found but no JSONL data yet.`;
      if (currentTab === 1) {
        header.box.setContent(`{center}${msg}{/center}`);
        toolsPanel.setContent('');
        subagentsPanel.setContent('');
        healthPanel.box.setContent('');
        skillPanel.setContent('');
        recapPanel.setContent('');
        costPanel.setContent('');
      } else if (currentTab === 2) {
        flowSummary.setContent(`{center}${msg}{/center}`);
        flowTimeline.setContent('');
      } else if (currentTab === 5) {
        treePanel.treeBox.setContent(`{center}${msg}{/center}`);
        treePanel.detailBox.setContent('');
      } else if (currentTab === 6) {
        teamsPanel.gantt.setContent(`{center}${msg}{/center}`);
        teamsPanel.flow.setContent('');
        teamsPanel.load.setContent('');
        teamsPanel.heat.setContent('');
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
      const nowTs = Date.now();
      for (const sa of agents) {
        sa.health = analyzeHealth(sa, nowTs, config.healthAnalyzer);
      }
      const subLines = updateSubagentsPanel(subagentsPanel, agents) || 1;
      const subHeight = Math.max(4, Math.min(subLines + 2, 16));
      subagentsPanel.height = subHeight;

      healthPanel.box.top = 12 + subHeight;
      healthPanel.render(agents);

      const conversations = parseConversation(jsonlInfo.jsonlPath);
      const convLines = updateSkillPanel(skillPanel, conversations) || 1;
      const convNeed = convLines + 2;

      const recaps = parseRecaps(jsonlInfo.jsonlPath);
      const recapLines = updateRecapPanel(recapPanel, recaps);
      const recapNeed = recapLines + 2;

      // 반응형 레이아웃: 터미널 높이에서 고정 영역을 빼고 conversation+recap에 분배
      // 고정: header(7) + tools(5) + subagents(dyn) + health(6) + cost(3) + statusbar(1) = 22 + subH
      const totalH = screen.height || 40;
      const fixedH = 7 + 5 + subHeight + HEALTH_PANEL_HEIGHT + 3 + 1;
      const available = Math.max(6, totalH - fixedH);

      let skillHeight, recapHeight;
      if (convNeed + recapNeed <= available) {
        skillHeight = convNeed;
        recapHeight = recapNeed;
      } else {
        // 비율 분배 (conversation 60%, recap 40%)
        skillHeight = Math.max(3, Math.min(convNeed, Math.floor(available * 0.6)));
        recapHeight = Math.max(3, available - skillHeight);
      }

      const skillTop = 12 + subHeight + HEALTH_PANEL_HEIGHT;
      skillPanel.top = skillTop;
      skillPanel.height = skillHeight;
      recapPanel.top = skillTop + skillHeight;
      recapPanel.height = recapHeight;

      const cost = parseCost();
      updateCostPanel(costPanel, cost);
      costPanel.top = skillTop + skillHeight + recapHeight;
      costPanel.bottom = undefined;
    } else if (currentTab === 2) {
      // Flow tab
      allFlowEvents = parseFlowEvents(jsonlInfo.jsonlPath);
      const summary = buildFlowSummary(allFlowEvents);
      updateFlowSummaryPanel(flowSummary, summary);
      updateFlowTimelinePanel(flowTimeline, getFilteredFlowEvents(), true);
      updateFlowFilterBar(flowFilterBar, flowFilters);
    } else if (currentTab === 5) {
      latestTreeData = loadTreeData(jsonlInfo.projectDir, session.sessionId, jsonlInfo.jsonlPath);
      updateTreePanel(treePanel, latestTreeData);
    } else if (currentTab === 6) {
      const treeData = loadTreeData(jsonlInfo.projectDir, session.sessionId, jsonlInfo.jsonlPath);
      const metrics = buildTeamsMetrics(treeData);
      updateTeamsPanels(teamsPanel, metrics);
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

  function refreshThrottled() {
    const now = Date.now();
    if (now - lastRefreshAt < REFRESH_THROTTLE_MS) {
      screen.render();
      return;
    }
    lastRefreshAt = now;
    setImmediate(refresh);
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

  screen.key(['1'], () => { if (!helpVisible) showTab(1); });
  screen.key(['2'], () => { if (!helpVisible) showTab(2); });
  screen.key(['3'], () => { if (!helpVisible) showTab(3); });
  screen.key(['4'], () => { if (!helpVisible) showTab(4); });
  screen.key(['5'], () => { if (!helpVisible) showTab(5); });
  screen.key(['6'], () => { if (!helpVisible) showTab(6); });

  screen.key(['up'], () => {
    if (helpVisible) { helpOverlay.scroll(-1); screen.render(); return; }
    if (currentTab === 2) { flowTimeline.scroll(-1); screen.render(); return; }
    if (currentTab === 3) { configTree.scroll(-1); screen.render(); return; }
    if (currentTab === 4) { metricsTable.scroll(-1); screen.render(); return; }
    if (currentTab === 5) {
      if (latestTreeData) { moveTreeCursor(treePanel, -1, latestTreeData); screen.render(); }
      return;
    }
    if (currentTab === 6) { teamsPanel.gantt.scroll(-1); screen.render(); return; }
    if (activeSessions.length > 1) {
      currentSessionIdx = (currentSessionIdx - 1 + activeSessions.length) % activeSessions.length;
      resetCache();
      refresh();
    }
  });

  screen.key(['down'], () => {
    if (helpVisible) { helpOverlay.scroll(1); screen.render(); return; }
    if (currentTab === 2) { flowTimeline.scroll(1); screen.render(); return; }
    if (currentTab === 3) { configTree.scroll(1); screen.render(); return; }
    if (currentTab === 4) { metricsTable.scroll(1); screen.render(); return; }
    if (currentTab === 5) {
      if (latestTreeData) { moveTreeCursor(treePanel, 1, latestTreeData); screen.render(); }
      return;
    }
    if (currentTab === 6) { teamsPanel.gantt.scroll(1); screen.render(); return; }
    if (activeSessions.length > 1) {
      currentSessionIdx = (currentSessionIdx + 1) % activeSessions.length;
      resetCache();
      refresh();
    }
  });

  // 페이지 단위 스크롤: 현재 탭의 주 스크롤 영역에 적용
  function scrollCurrentPanel(delta) {
    if (helpVisible) return helpOverlay.scroll(delta);
    if (currentTab === 2) return flowTimeline.scroll(delta);
    if (currentTab === 3) return configTree.scroll(delta);
    if (currentTab === 4) return metricsTable.scroll(delta);
    if (currentTab === 5) return treePanel.treeBox.scroll(delta);
    if (currentTab === 6) return teamsPanel.gantt.scroll(delta);
  }

  function setScrollToEdge(top) {
    if (helpVisible) { helpOverlay.setScrollPerc(top ? 0 : 100); return; }
    if (currentTab === 2) { flowTimeline.setScrollPerc(top ? 0 : 100); return; }
    if (currentTab === 3) { configTree.setScrollPerc(top ? 0 : 100); return; }
    if (currentTab === 4) { metricsTable.setScrollPerc(top ? 0 : 100); return; }
    if (currentTab === 5) { treePanel.treeBox.setScrollPerc(top ? 0 : 100); return; }
    if (currentTab === 6) { teamsPanel.gantt.setScrollPerc(top ? 0 : 100); return; }
  }

  function pageSize() {
    // 현재 탭 활성 박스의 내부 높이 기반 (마지막 행 겹침 방지로 -2)
    let h = 20;
    if (helpVisible) h = helpOverlay.height;
    else if (currentTab === 2) h = flowTimeline.height;
    else if (currentTab === 3) h = configTree.height;
    else if (currentTab === 4) h = metricsTable.height;
    else if (currentTab === 5) h = treePanel.treeBox.height;
    else if (currentTab === 6) h = teamsPanel.gantt.height;
    const n = typeof h === 'number' ? h : 20;
    return Math.max(3, n - 2);
  }

  screen.key(['pageup'], () => { scrollCurrentPanel(-pageSize()); screen.render(); });
  screen.key(['pagedown'], () => { scrollCurrentPanel(pageSize()); screen.render(); });
  screen.key(['home'], () => { setScrollToEdge(true); screen.render(); });
  screen.key(['end'], () => { setScrollToEdge(false); screen.render(); });

  // Flow filter keys (only active on tab 2, not during help)
  screen.key(['h'], () => { if (!helpVisible && currentTab === 2) toggleFilter('hook'); });
  screen.key(['f'], () => { if (!helpVisible && currentTab === 2) toggleFilter('rule'); });
  screen.key(['m'], () => { if (!helpVisible && currentTab === 2) toggleFilter('memory'); });
  screen.key(['s'], () => { if (!helpVisible && currentTab === 2) toggleFilter('skill'); });
  screen.key(['u'], () => { if (!helpVisible && currentTab === 2) toggleFilter('user'); });

  // Tree tab keys
  screen.key(['a'], () => {
    if (helpVisible || renameActive) return;
    if (currentTab !== 5 || !latestTreeData) return;
    toggleTreeMode(treePanel, latestTreeData);
    screen.render();
  });

  screen.key(['['], () => {
    if (helpVisible || renameActive) return;
    if (currentTab !== 5 && currentTab !== 6) return;
    if (activeSessions.length > 1) {
      currentSessionIdx = (currentSessionIdx - 1 + activeSessions.length) % activeSessions.length;
      resetCache();
      refresh();
    }
  });

  screen.key([']'], () => {
    if (helpVisible || renameActive) return;
    if (currentTab !== 5 && currentTab !== 6) return;
    if (activeSessions.length > 1) {
      currentSessionIdx = (currentSessionIdx + 1) % activeSessions.length;
      resetCache();
      refresh();
    }
  });

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
