const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { readJsonlIncremental } = require('../utils/jsonl-reader');
const { parseSubagents } = require('./subagent-parser');
const { analyzeHealth } = require('./health-analyzer');
const config = require('../config');

function collectAgentToolUses(entries) {
  const map = new Map();
  for (const entry of entries) {
    if (entry.type !== 'assistant' || !entry.message) continue;
    const content = entry.message.content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (block.type === 'tool_use' && block.name === 'Agent' && block.id) {
        map.set(block.id, {
          description: (block.input && block.input.description) || '',
          subagentType: (block.input && block.input.subagent_type) || '',
          timestamp: entry.timestamp || null,
        });
      }
    }
  }
  return map;
}

function makeNode(kind, id, opts = {}) {
  return {
    id,
    kind,
    agentType: opts.agentType || 'main',
    description: opts.description || '',
    parentId: opts.parentId || null,
    toolUseId: opts.toolUseId || null,
    depth: opts.depth || 0,
    isRunning: opts.isRunning !== undefined ? opts.isRunning : false,
    startTime: opts.startTime || null,
    endTime: opts.endTime || null,
    elapsedMs: opts.elapsedMs || 0,
    model: opts.model || null,
    tokensIn: opts.tokensIn || 0,
    tokensOut: opts.tokensOut || 0,
    tools: opts.tools || {},
    diagnostics: opts.diagnostics || { errors: [], deniedCount: 0, lastActivity: '', lastActivityText: '', repeatPattern: null },
    children: [],
  };
}

function buildTree({ sessionId, mainEntries, subagents, mainEntriesBySubagent }) {
  const root = makeNode('session', sessionId, { agentType: 'main', depth: 0 });

  const toolUseMetaFromMain = collectAgentToolUses(mainEntries);

  const toolUseIdToParentSubagent = new Map();
  if (mainEntriesBySubagent) {
    for (const [subagentId, entries] of mainEntriesBySubagent.entries()) {
      const m = collectAgentToolUses(entries);
      for (const toolId of m.keys()) {
        toolUseIdToParentSubagent.set(toolId, subagentId);
      }
    }
  }

  const byId = new Map();
  byId.set(root.id, root);

  const agentNodes = subagents.map(sa => {
    const node = makeNode('agent', sa.id, {
      agentType: sa.type || 'unknown',
      description: sa.description || '',
      toolUseId: sa.parentToolUseID || null,
      isRunning: !!sa.isRunning,
      startTime: sa.startTime || null,
      endTime: sa.endTime || null,
      elapsedMs: sa.elapsedMs || 0,
      model: sa.model || null,
      tokensIn: sa.tokensIn || 0,
      tokensOut: sa.tokensOut || 0,
      tools: sa.tools || {},
      diagnostics: sa.diagnostics || { errors: [], deniedCount: 0, lastActivity: '', lastActivityText: '', repeatPattern: null },
    });
    node._subagent = sa;
    byId.set(node.id, node);
    return node;
  });

  for (const node of agentNodes) {
    const parentToolUseID = node.toolUseId;
    let parent = null;

    if (parentToolUseID) {
      if (toolUseMetaFromMain.has(parentToolUseID)) {
        parent = root;
      } else if (toolUseIdToParentSubagent.has(parentToolUseID)) {
        const parentSubId = toolUseIdToParentSubagent.get(parentToolUseID);
        parent = byId.get(parentSubId) || null;
      }
    }

    if (!parent) {
      logger.log('debug', `tree: orphan subagent ${node.id} parentToolUseID=${parentToolUseID}, attach to root`);
      parent = root;
    }

    node.parentId = parent.id;
    node.depth = parent.depth + 1;
    parent.children.push(node);
  }

  function sortChildren(n) {
    n.children.sort((a, b) => {
      const ta = a.startTime ? Date.parse(a.startTime) : 0;
      const tb = b.startTime ? Date.parse(b.startTime) : 0;
      return ta - tb;
    });
    n.children.forEach(sortChildren);
  }
  sortChildren(root);

  const flatten = [];
  function walk(n) {
    flatten.push(n);
    for (const c of n.children) walk(c);
  }
  walk(root);

  const now = Date.now();
  for (const node of agentNodes) {
    node.health = analyzeHealth(node._subagent, now, config.healthAnalyzer);
  }

  return { root, byId, flatten };
}

const treeCache = new Map();

function getTreeFingerprint(mainJsonlPath, subagentsDir) {
  let fp = '';
  try {
    if (mainJsonlPath && fs.existsSync(mainJsonlPath)) {
      fp += `m:${fs.statSync(mainJsonlPath).mtimeMs}`;
    }
    if (fs.existsSync(subagentsDir)) {
      const files = fs.readdirSync(subagentsDir).filter(f => f.endsWith('.jsonl')).sort();
      for (const f of files) {
        fp += `|${f}:${fs.statSync(path.join(subagentsDir, f)).mtimeMs}`;
      }
    }
  } catch (e) {
    return null;
  }
  return fp;
}

function refreshHealth(treeData) {
  const now = Date.now();
  for (const node of treeData.flatten) {
    if (node._subagent) {
      node.health = analyzeHealth(node._subagent, now, config.healthAnalyzer);
    }
  }
  return treeData;
}

function loadTreeData(projectDir, sessionId, mainJsonlPath) {
  const subagentsDir = path.join(projectDir, sessionId, 'subagents');
  const fp = getTreeFingerprint(mainJsonlPath, subagentsDir);
  const cacheKey = `${sessionId}|${mainJsonlPath}`;
  const cached = treeCache.get(cacheKey);
  if (cached && fp !== null && cached.fp === fp) {
    return refreshHealth(cached.treeData);
  }

  const mainEntries = mainJsonlPath && fs.existsSync(mainJsonlPath)
    ? readJsonlIncremental(mainJsonlPath)
    : [];

  const subagents = parseSubagents(projectDir, sessionId);

  const mainEntriesBySubagent = new Map();
  if (fs.existsSync(subagentsDir)) {
    for (const sa of subagents) {
      const jsonl = path.join(subagentsDir, `${sa.id}.jsonl`);
      if (fs.existsSync(jsonl)) {
        mainEntriesBySubagent.set(sa.id, readJsonlIncremental(jsonl));
      }
    }
  }

  const treeData = buildTree({ sessionId, mainEntries, subagents, mainEntriesBySubagent });
  if (fp !== null) {
    treeCache.set(cacheKey, { treeData, fp });
  }
  return treeData;
}

function resetTreeCache() {
  treeCache.clear();
}

module.exports = { collectAgentToolUses, buildTree, loadTreeData, resetTreeCache };
