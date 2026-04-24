const fs = require('fs');
const path = require('path');
const config = require('../config');

const LOG_FILE = path.join(config.CLAUDE_DIR, 'logs', 'skill-calls.jsonl');
const SKILLS_DIR = path.join(config.CLAUDE_DIR, 'skills');
const PLUGINS_DIR = path.join(config.CLAUDE_DIR, 'plugins');

const EXCLUDED = new Set([
  'using-superpowers',
  'superpowers:using-superpowers',
  'init',
  'review',
  'security-review',
  'sc:README',
  'sc:help',
]);

const DAY_MS = 86400 * 1000;

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    return fs.readFileSync(filePath, 'utf-8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

function collectInstalledSkills() {
  const skills = [];

  function scanDir(baseDir, isCustom) {
    if (!fs.existsSync(baseDir)) return;
    try {
      for (const name of fs.readdirSync(baseDir)) {
        const dir = path.join(baseDir, name);
        let stat;
        try { stat = fs.statSync(dir); } catch { continue; }
        if (!stat.isDirectory()) continue;
        const mdPath = path.join(dir, 'SKILL.md');
        if (!fs.existsSync(mdPath)) continue;
        let ctime;
        try { ctime = fs.statSync(mdPath).ctimeMs; } catch { ctime = stat.ctimeMs; }
        skills.push({ name, path: dir, ctime, isCustom });
      }
    } catch { /* noop */ }
  }

  scanDir(SKILLS_DIR, true);

  // plugins 스캔: ~/.claude/plugins/{plugin}/skills/{skill}/SKILL.md
  if (fs.existsSync(PLUGINS_DIR)) {
    try {
      for (const plugin of fs.readdirSync(PLUGINS_DIR)) {
        const pluginSkills = path.join(PLUGINS_DIR, plugin, 'skills');
        scanDir(pluginSkills, false);
      }
    } catch { /* noop */ }
  }

  return skills;
}

function aggregateCalls(entries) {
  const by = {};
  for (const e of entries) {
    if (!e.skill) continue;
    if (!by[e.skill]) {
      by[e.skill] = { count: 0, manual: 0, lastTs: e.ts || '' };
    }
    by[e.skill].count++;
    if (e.trigger === 'manual') by[e.skill].manual++;
    if (e.ts && e.ts > by[e.skill].lastTs) by[e.skill].lastTs = e.ts;
  }
  return by;
}

function classifyState(stat, ctimeMs, now) {
  const ageDays = (now - ctimeMs) / DAY_MS;
  if (!stat || stat.count === 0) {
    return ageDays >= 30 ? 'unused' : 'new';
  }
  const last = new Date(stat.lastTs).getTime();
  if (Number.isNaN(last)) return 'unknown';
  const daysSince = (now - last) / DAY_MS;
  if (daysSince <= 7) return 'active';
  if (daysSince <= 90) return 'dormant';
  return 'dead';
}

function relTime(iso, now) {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = now - t;
  const days = Math.floor(diff / DAY_MS);
  if (days >= 1) return `${days}일 전`;
  const hours = Math.floor(diff / (3600 * 1000));
  if (hours >= 1) return `${hours}시간 전`;
  const mins = Math.max(1, Math.floor(diff / 60000));
  return `${mins}분 전`;
}

function parseSkillMetrics() {
  const entries = readJsonl(LOG_FILE);
  const agg = aggregateCalls(entries);
  const installed = collectInstalledSkills();
  const now = Date.now();

  const rows = [];
  for (const s of installed) {
    if (EXCLUDED.has(s.name)) continue;
    const stat = agg[s.name];
    const state = classifyState(stat, s.ctime, now);
    const ageDays = Math.floor((now - s.ctime) / DAY_MS);

    rows.push({
      name: s.name,
      isCustom: s.isCustom,
      state,
      lastTs: stat?.lastTs || null,
      lastRel: stat ? relTime(stat.lastTs, now) : '—',
      count: stat?.count || 0,
      manualPct: stat && stat.count > 0 ? Math.round((stat.manual / stat.count) * 100) : 0,
      ageDays,
    });
  }

  // 정렬: 상태 우선순위(active>dormant>dead>unused>new) + 호출수 desc
  const order = { active: 0, dormant: 1, dead: 2, unused: 3, new: 4, unknown: 5 };
  rows.sort((a, b) => {
    const d = order[a.state] - order[b.state];
    if (d !== 0) return d;
    return b.count - a.count;
  });

  const summary = {
    totalCalls: entries.length,
    firstTs: entries.length > 0 ? entries[0].ts : null,
    lastTs: entries.length > 0 ? entries[entries.length - 1].ts : null,
    counts: { active: 0, dormant: 0, dead: 0, unused: 0, new: 0 },
    excludedCount: installed.filter(s => EXCLUDED.has(s.name)).length,
    logExists: fs.existsSync(LOG_FILE),
  };
  for (const r of rows) {
    if (summary.counts[r.state] !== undefined) summary.counts[r.state]++;
  }

  return { rows, summary };
}

module.exports = { parseSkillMetrics, EXCLUDED };
