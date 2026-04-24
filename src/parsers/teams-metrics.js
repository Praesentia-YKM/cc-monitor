// Tab 6 Teams 뷰용 파생 메트릭: Gantt / Flow / Load / Bottleneck.
// tree-builder의 트리 데이터를 입력으로 받아 4개 서브패널에 바로 쓸 형태로 변환.

function buildTeamsMetrics(treeData) {
  if (!treeData || !Array.isArray(treeData.flatten)) {
    return emptyMetrics();
  }

  const agents = treeData.flatten.filter(n => n.kind === 'agent');
  const root = treeData.root;

  return {
    gantt: buildGantt(root, agents),
    flow: buildFlow(root, agents),
    load: buildLoad(agents),
    heat: buildHeat(agents),
  };
}

function emptyMetrics() {
  return { gantt: { items: [], minMs: 0, maxMs: 0 }, flow: [], load: [], heat: [] };
}

function buildGantt(root, agents) {
  const items = [];

  // 메인 세션은 최초 agent 시작 ~ 가장 늦은 종료 구간으로 bar 계산
  const agentStarts = agents.map(a => a.startTime ? Date.parse(a.startTime) : null).filter(Boolean);
  const agentEnds = agents.map(a => {
    if (a.isRunning) return Date.now();
    return a.endTime ? Date.parse(a.endTime) : null;
  }).filter(Boolean);

  if (agentStarts.length > 0) {
    items.push({
      id: root.id,
      type: 'main',
      label: 'main',
      startMs: Math.min(...agentStarts),
      endMs: Math.max(...agentEnds),
      isRunning: true,
      depth: 0,
    });
  }

  for (const a of agents) {
    if (!a.startTime) continue;
    const startMs = Date.parse(a.startTime);
    const endMs = a.isRunning ? Date.now() : (a.endTime ? Date.parse(a.endTime) : startMs);
    items.push({
      id: a.id,
      type: a.agentType || 'unknown',
      label: a.agentType || 'unknown',
      description: a.description || '',
      startMs,
      endMs,
      isRunning: !!a.isRunning,
      depth: a.depth || 1,
    });
  }

  items.sort((a, b) => a.startMs - b.startMs);

  const minMs = items.length > 0 ? Math.min(...items.map(i => i.startMs)) : 0;
  const maxMs = items.length > 0 ? Math.max(...items.map(i => i.endMs)) : 0;

  return { items, minMs, maxMs };
}

function buildFlow(root, agents) {
  // 부모(main 또는 상위 agent)별로 자식들을 시작시각 순으로 그룹핑.
  // 각 엔트리: { parentLabel, children: [{type, desc, startMs, endMs, isRunning}] }
  const byParent = new Map();
  const labelOf = new Map();
  labelOf.set(root.id, 'main');
  for (const a of agents) labelOf.set(a.id, a.agentType || 'unknown');

  for (const a of agents) {
    const pid = a.parentId || root.id;
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid).push(a);
  }

  const groups = [];
  for (const [pid, children] of byParent.entries()) {
    children.sort((x, y) => {
      const ax = x.startTime ? Date.parse(x.startTime) : 0;
      const bx = y.startTime ? Date.parse(y.startTime) : 0;
      return ax - bx;
    });
    groups.push({
      parentId: pid,
      parentLabel: labelOf.get(pid) || pid.substring(0, 10),
      children: children.map(c => ({
        id: c.id,
        type: c.agentType || 'unknown',
        description: c.description || '',
        startMs: c.startTime ? Date.parse(c.startTime) : 0,
        endMs: c.isRunning ? Date.now() : (c.endTime ? Date.parse(c.endTime) : 0),
        isRunning: !!c.isRunning,
        elapsedMs: c.elapsedMs || 0,
        hasError: !!(c.diagnostics && c.diagnostics.errors && c.diagnostics.errors.length > 0),
      })),
    });
  }

  groups.sort((a, b) => (a.parentLabel === 'main' ? -1 : 1));
  return groups;
}

function buildLoad(agents) {
  const byType = new Map();
  for (const a of agents) {
    const key = a.agentType || 'unknown';
    if (!byType.has(key)) {
      byType.set(key, { type: key, count: 0, totalMs: 0, tokensIn: 0, tokensOut: 0, toolCalls: 0, runningCount: 0 });
    }
    const m = byType.get(key);
    m.count += 1;
    m.totalMs += a.elapsedMs || 0;
    m.tokensIn += a.tokensIn || 0;
    m.tokensOut += a.tokensOut || 0;
    m.toolCalls += sumTools(a.tools);
    if (a.isRunning) m.runningCount += 1;
  }
  return [...byType.values()].sort((a, b) => b.totalMs - a.totalMs);
}

function buildHeat(agents) {
  // 활성도 밀도 = tool calls / 분. 높을수록 모델이 바쁘게 움직였다는 의미.
  // running 중인데 밀도 낮으면 "병목/대기" 시그널.
  const items = agents.map(a => {
    const toolCalls = sumTools(a.tools);
    const minutes = Math.max(1 / 60, (a.elapsedMs || 0) / 60000);
    const density = toolCalls / minutes;
    return {
      id: a.id,
      type: a.agentType || 'unknown',
      description: a.description || '',
      toolCalls,
      elapsedMs: a.elapsedMs || 0,
      density,
      isRunning: !!a.isRunning,
      hasError: !!(a.diagnostics && a.diagnostics.errors && a.diagnostics.errors.length > 0),
    };
  });

  const maxDensity = items.reduce((m, x) => Math.max(m, x.density), 0) || 1;
  for (const h of items) {
    h.activePct = Math.min(1, h.density / maxDensity);
    h.stalled = h.isRunning && h.activePct < 0.25 && h.elapsedMs > 60_000;
  }
  items.sort((a, b) => b.density - a.density);
  return items;
}

function sumTools(tools) {
  if (!tools) return 0;
  return Object.values(tools).reduce((s, v) => s + (v || 0), 0);
}

module.exports = { buildTeamsMetrics };
