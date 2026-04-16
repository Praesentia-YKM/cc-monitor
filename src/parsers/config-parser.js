const fs = require('fs');
const path = require('path');
const config = require('../config');

const RULES_DIR = path.join(config.CLAUDE_DIR, 'rules');
const SKILLS_DIR = path.join(config.CLAUDE_DIR, 'skills');
const SETTINGS_FILE = path.join(config.CLAUDE_DIR, 'settings.json');

const SKILL_LABELS = {
  'add-validation': '코딩 패턴 교정/금지 규칙 자동 생성',
  'allsp-requirements-analysis': 'ALLSP 요구사항 심층 분석',
  'analysis-pipeline': '코드 아키텍처 분석·평가 파이프라인',
  'approval-workflow-guide': 'ALLSP 결재 상태코드 가이드',
  'budget-excel-import': '예산 엑셀 업로드 처리',
  'cnf-code-review': '코드리뷰 .md 기반 심층 Q&A 분석',
  'concept-explainer': '개발 용어/개념 직관적 설명',
  'continuous-learning': 'Homunculus 자동 학습 시스템 관리',
  'dev-pipeline': '요구사항→분석→설계→구현→검증 전체 파이프라인',
  'domain-analyzer': '코드베이스 도메인 구조 분석',
  'e2e-testing': 'ALLSP 웹 페이지 E2E 테스트',
  'grid-paging-converter': 'DHTMLX 그리드 서버 페이징 변환',
  'learn-volume': '볼륨 학습 진행 관리',
  'learning': '학습 세션 관리',
  'multi-agent-review': '듀얼 에이전트 병렬 코드리뷰',
  'notion-document-writer': '노션 문서 자동 작성',
  'requirements-analysis': '요구사항 분석 및 설계 도출',
  'study-coding': '학습하면서 구현하는 스터디 코딩',
  'sync-study': 'Claude 오브젝트 → cnf-ai-study 동기화',
  'test-scenario-generator': '테스트 시나리오/TC 자동 추출',
  'webapp-testing': 'Playwright 기반 웹앱 테스트',
  'brainstorming': '기능 설계 전 아이디어 브레인스토밍',
  'dispatching-parallel-agents': '독립 작업 병렬 에이전트 분배',
  'executing-plans': '구현 계획 단계별 실행',
  'find-skills': '스킬 검색 및 설치 도우미',
  'finishing-a-development-branch': '개발 브랜치 마무리·통합 판단',
  'humanizer': '텍스트 자연스러운 표현 변환',
  'receiving-code-review': '코드리뷰 피드백 수신·반영',
  'requesting-code-review': '코드리뷰 요청·품질 검증',
  'subagent-driven-development': '서브에이전트 기반 태스크별 개발',
  'systematic-debugging': '체계적 버그 분석·디버깅',
  'test-driven-development': 'TDD: Red→Green→Refactor 사이클',
  'ui-ux-pro-max': 'UI/UX 디자인 인텔리전스',
  'using-git-worktrees': 'Git worktree 기반 격리 작업',
  'using-superpowers': '스킬 탐색·활성화 프로토콜',
  'verification-before-completion': '완료 선언 전 검증 체크리스트',
  'writing-plans': '멀티스텝 구현 계획 작성',
  'writing-skills': '스킬 생성·편집·배포',
};

function parseRules() {
  const files = fs.readdirSync(RULES_DIR).filter(f => f.endsWith('.md'));
  return files.map(file => {
    const content = fs.readFileSync(path.join(RULES_DIR, file), 'utf-8');
    const lines = content.split('\n').slice(0, 3);
    let description = '';
    for (const line of lines) {
      const m3 = line.match(/^###\s+(.+)/);
      if (m3) { description = m3[1].trim(); break; }
      const m1 = line.match(/^#\s+(.+)/);
      if (m1) { description = m1[1].trim(); break; }
    }
    return { name: file, description };
  });
}

function parseHooks(settings) {
  const hooks = settings.hooks || {};
  const result = [];
  for (const [event, matchers] of Object.entries(hooks)) {
    if (!Array.isArray(matchers)) continue;
    for (const entry of matchers) {
      const matcher = entry.matcher || '(all)';
      const hookList = entry.hooks || [];
      for (const h of hookList) {
        const command = h.command || '';
        const parts = command.replace(/\\/g, '/').split('/');
        const scriptName = parts[parts.length - 1] || '';
        result.push({ event, matcher: matcher || '(all)', command, scriptName });
      }
    }
  }
  return result;
}

function parseSkills() {
  const dirents = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() || d.isSymbolicLink());

  return dirents.map(d => {
    const dir = d.name;
    const isCustom = !d.isSymbolicLink();
    const skillDir = path.join(SKILLS_DIR, dir);
    const candidates = ['skill.md', 'SKILL.md'];
    let filePath = null;
    for (const c of candidates) {
      const p = path.join(skillDir, c);
      if (fs.existsSync(p)) { filePath = p; break; }
    }
    const label = SKILL_LABELS[dir] || '';
    if (!filePath) return { name: dir, description: label, isCustom };

    const content = fs.readFileSync(filePath, 'utf-8');
    let description = label;
    if (!description) {
      const match = content.match(/^---[\s\S]*?description:\s*"?(.+?)"?\s*$/m);
      if (match) {
        let raw = match[1].trim();
        raw = raw.replace(/^Use when\b[^.]*\.\s*/i, '');
        raw = raw.replace(/^This skill should be used when\b[^.]*\.\s*/i, '');
        raw = raw.replace(/^You MUST use this\b[^.]*[-—]\s*/i, '');
        raw = raw.replace(/Triggers?:.*$/i, '').trim();
        if (raw.length > 80) raw = raw.substring(0, 80) + '...';
        description = raw;
      }
    }
    return { name: dir, description, isCustom };
  });
}

function parsePlugins(settings) {
  const enabled = settings.enabledPlugins || {};
  return Object.keys(enabled)
    .filter(key => enabled[key])
    .map(key => {
      const atIdx = key.indexOf('@');
      if (atIdx === -1) return { name: key, marketplace: '' };
      return { name: key.substring(0, atIdx), marketplace: key.substring(atIdx + 1) };
    });
}

function readSettings() {
  const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
  return JSON.parse(raw);
}

function parseConfig() {
  let settings = {};
  try { settings = readSettings(); } catch (_) {}

  let rules = [];
  try { rules = parseRules(); } catch (_) {}

  let hooks = [];
  try { hooks = parseHooks(settings); } catch (_) {}

  let skills = [];
  try { skills = parseSkills(); } catch (_) {}

  let plugins = [];
  try { plugins = parsePlugins(settings); } catch (_) {}

  const model = settings.model || '';

  return { rules, hooks, skills, plugins, model };
}

module.exports = { parseConfig };
