const fs = require('fs');
const path = require('path');
const config = require('../config');
const { readJsonFile } = require('../utils/jsonl-reader');

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function findActiveSessions() {
  const sessionsDir = config.SESSIONS_DIR;
  try {
    const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
    const sessions = [];

    for (const file of files) {
      const data = readJsonFile(path.join(sessionsDir, file));
      if (!data || !data.pid) continue;

      if (isProcessAlive(data.pid)) {
        sessions.push(data);
      }
    }

    // cwd 기준 그루핑 → 그룹 내 최신순
    sessions.sort((a, b) => {
      const cwdA = (a.cwd || '').toLowerCase();
      const cwdB = (b.cwd || '').toLowerCase();
      if (cwdA !== cwdB) return cwdA < cwdB ? -1 : 1;
      return (b.startedAt || 0) - (a.startedAt || 0);
    });
    return sessions;
  } catch {
    return [];
  }
}

function findSessionJsonl(session) {
  const projectsDir = config.PROJECTS_DIR;
  try {
    const projects = fs.readdirSync(projectsDir);
    for (const project of projects) {
      const jsonlPath = path.join(projectsDir, project, `${session.sessionId}.jsonl`);
      if (fs.existsSync(jsonlPath)) {
        return { jsonlPath, projectDir: path.join(projectsDir, project), projectName: project };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

module.exports = { findActiveSessions, findSessionJsonl };
