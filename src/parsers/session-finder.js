const fs = require('fs');
const path = require('path');
const config = require('../config');
const { readJsonFile } = require('../utils/jsonl-reader');
const logger = require('../utils/logger');

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM = process exists but no permission to signal (Windows 권한 차이)
    // ESRCH = process does not exist
    return e.code === 'EPERM';
  }
}

function findActiveSessions() {
  const { verifyProcessIdentity } = require('../utils/process-info');
  const sessionsDir = config.SESSIONS_DIR;
  try {
    const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
    const sessions = [];

    for (const file of files) {
      const data = readJsonFile(path.join(sessionsDir, file));
      if (!data || !data.pid) continue;

      if (!isProcessAlive(data.pid)) continue;

      if (!verifyProcessIdentity(data.pid, data.startedAt)) {
        logger.log('warn', `PID ${data.pid} alive but started_at mismatch — likely PID reuse, skipping`, {
          sessionId: data.sessionId,
          expected: data.startedAt,
        });
        continue;
      }

      sessions.push(data);
    }

    sessions.sort((a, b) => {
      const cwdA = (a.cwd || '').toLowerCase();
      const cwdB = (b.cwd || '').toLowerCase();
      if (cwdA !== cwdB) return cwdA < cwdB ? -1 : 1;
      return (b.startedAt || 0) - (a.startedAt || 0);
    });
    logger.log('debug', `Found ${sessions.length} active sessions`);
    return sessions;
  } catch (e) {
    logger.log('warn', 'findActiveSessions failed', e.message);
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
