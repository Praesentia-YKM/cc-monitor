# Agent Execution Tree — Design Spec

**Date:** 2026-04-22
**Status:** Draft (awaiting approval)
**Author:** ykm8864

## 1. Motivation

cc-monitor의 현재 Subagents 패널은 **flat 리스트**만 보여준다. 메인 에이전트가 서브에이전트를 spawn하고, 그 서브에이전트가 또 다른 서브에이전트를 spawn하는 **계층 구조가 드러나지 않는다**. 복잡한 다중 에이전트 작업을 실시간으로 관찰할 때, 어떤 에이전트가 어떤 에이전트를 호출했는지 한눈에 파악하기 어렵다.

본 spec은 `cc-monitor`에 **에이전트 실행 트리 해석 기능**을 추가하여, 활성 Claude Code 세션의 서브에이전트 계층 구조를 실시간 TUI 트리로 시각화하는 것을 목표로 한다.

### 참고 자료

[hoangsonww/Claude-Code-Agent-Monitor](https://github.com/hoangsonww/Claude-Code-Agent-Monitor)의 "Subagent Hierarchy" / "Per-session agent hierarchy tree (parent/child)" 개념을 참고한다. 단, 해당 프로젝트는 React + Express + SQLite + WebSocket 기반의 웹 대시보드로 스택/철학이 cc-monitor와 정반대이므로, **데이터 모델 관점만 참고**하고 구현은 cc-monitor의 blessed TUI + JSONL 파일 read-only 파싱 원칙을 따른다.

## 2. Goals / Non-Goals

### Goals
- 활성 세션의 에이전트 계층 구조를 실시간(2초 refresh)으로 TUI 트리로 표시
- 부모-자식 관계를 명시적 데이터 링크(`parentToolUseID`) 기반으로 정확히 조립
- 노드별 툴 사용 요약(`Read:12 Grep:8 ...`) 동시 표시
- 선택된 노드의 상세 진단 정보(에러, 마지막 활동 등)를 하단 패널에 표시
- 여러 세션 전환 및 완료된 에이전트 토글 지원

### Non-Goals (YAGNI)
- 비용/성능 분석(노드별 token·비용 누적) — Overview Cost 패널로 충분
- 트리 export / 저장 / 검색 / 필터
- 참고 repo의 D3.js 워크플로 DAG 시각화
- Hook 시스템 통합 — JSONL 파일 파싱으로 충분
- 툴 콜 단위 세부 트리 (모든 Read/Bash 등을 트리 노드로) — 노이즈 >> 가치

## 3. Design Decisions (결정 사항)

### 3.1 주 사용처: 실시간 관찰
세션 실행 중 에이전트 spawn을 live로 관찰하는 것이 주목적. 사후 분석이나 비용 분석은 범위 외.

### 3.2 UI 위치: 새 4번 "Tree" 탭
기존 Overview/Flow/Config 3탭에 **4번째 Tree 탭** 추가. 별도 화면으로 계속 켜놓고 볼 수 있고, 노드당 풍부한 정보(duration, tool summary, description) 표시 공간 확보.

### 3.3 트리 범위: 서브에이전트 계층 + 노드별 툴 요약
툴 콜은 노드로 만들지 않고, 각 에이전트 노드에 툴 사용 요약(`Read:12 Bash:3 ...`)만 부착. `subagent-parser.js`가 이미 수집 중인 `tools` 객체 재활용.

### 3.4 완료된 에이전트: `a` 토글
기본: running + 최근 완료(5분 이내) 표시. 단축키 `a`로 전체 표시 모드 전환. Flow 탭의 필터 키 UX 패턴과 일관됨.

### 3.5 인터랙션: 노드 선택 + 하단 디테일 패널
`↑↓`으로 노드 이동, 선택된 노드의 진단 정보를 하단 1/3 영역에 표시. 세션 스위처 키는 Tree 탭 내에서 `[` / `]`로 재배치 (Overview 탭의 `↑↓`과 역할 충돌 회피).

### 3.6 트리 조립 알고리즘: `parentToolUseID` 기반
JSONL 엔트리에 존재하는 `parentToolUseID` 필드로 명시적 링크 조립. 타임스탬프/이름 매칭 방식은 사용하지 않음(동일 agentType 동시 spawn 시 모호).

## 4. Architecture

### 4.1 Data Flow

```
┌──────────────────────────────────────────────────────────┐
│  기존 (변경 없음)                                          │
│  session-finder  →  session-parser  →  conversation       │
│                                       ↘  cost            │
│                                       ↘  recap           │
│                                       ↘  subagent-parser │ ← 최소 수정
│                                       ↘  flow-parser     │
└──────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────┐
│  신규                                                     │
│  tree-builder.js                                          │
│   - main JSONL에서 Agent tool_use 수집                     │
│     (id, input.subagent_type, input.description, ts)      │
│   - subagent-parser 결과와 parentToolUseID로 조인          │
│   - 재귀: 서브에이전트 JSONL 내부의 Agent tool_use도 동일   │
│   - 반환: { root, byId, flatten }                         │
└──────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────┐
│  UI                                                       │
│  tree-panel.js  (신규, layout.js가 4번째 탭으로 등록)     │
│   - 상단 2/3: 트리 렌더링 (blessed.box + 문자열 조립)     │
│   - 하단 1/3: 디테일 패널                                 │
│   - 키 바인딩: ↑↓ 노드 이동, [/] 세션, a 토글,             │
│               q/ESC 종료 (공통)                           │
└──────────────────────────────────────────────────────────┘
```

### 4.2 File Changes

| 파일 | 변경 | 설명 |
|------|------|------|
| `src/parsers/tree-builder.js` | **신규** | 트리 조립 로직. subagent-parser 결과 + main JSONL Agent tool_use 수집 → TreeNode 그래프 반환 |
| `src/ui/tree-panel.js` | **신규** | 4번째 탭 UI. 트리 렌더러 + 디테일 서브패널 |
| `src/ui/layout.js` | 수정 | 탭 추가: `[1:Overview] [2:Flow] [3:Config] [4:Tree]` |
| `src/app.js` | 수정 | 탭 키바인딩(`4`), Tree 탭 전용 키(`a`, `[`, `]`, ↑↓) 라우팅 |
| `src/parsers/subagent-parser.js` | 수정(최소) | `parentToolUseID`를 에이전트 객체에 포함 |
| `src/ui/help-overlay.js` | 수정 | Tree 탭 단축키 도움말 추가 |
| `README.md` | 수정 | Tab 4 섹션 추가 |
| `test/tree-builder.test.js` | **신규** | 트리 조립 단위 테스트 (fixture 기반) |
| `test/fixtures/tree/` | **신규** | 테스트용 샘플 JSONL 4종 |

## 5. Data Model

### 5.1 TreeNode 스키마

```js
TreeNode = {
  // 식별
  id: string,              // main: sessionId / subagent: agentId
  kind: 'session' | 'agent',
  agentType: string,       // 'main' | 'claude-code-guide' | 'Explore' | ...
  description: string,     // Agent 호출 시 전달된 description (subagent만)

  // 계층
  parentId: string | null, // root는 null
  toolUseId: string | null,// 부모의 Agent tool_use id (root는 null)
  depth: number,           // 렌더링 들여쓰기용

  // 상태
  isRunning: boolean,
  startTime: ISO8601,
  endTime: ISO8601 | null,
  elapsedMs: number,

  // 리소스
  model: string | null,
  tokensIn: number,
  tokensOut: number,
  tools: { [toolName]: number },

  // 진단 (subagent-parser가 이미 수집 중)
  diagnostics: {
    errors: string[],
    deniedCount: number,
    lastActivity: string,
    repeatPattern: { tool, count } | null,
  },

  // 자식
  children: TreeNode[],    // startTime asc 정렬
}
```

### 5.2 Builder 반환

```js
buildTree(projectDir, sessionId) → {
  root: TreeNode,             // session 노드 (children = top-level subagents)
  byId: Map<string, TreeNode>,// 빠른 조회
  flatten: TreeNode[],        // DFS 순회 결과 (렌더링/커서 이동용)
}
```

### 5.3 매핑 규칙

1. `main JSONL`의 `tool_use.name === 'Agent'` 블록 수집 (Claude Code의 subagent spawn 툴 — 일부 자료에서 "Task tool"로도 불리지만 실제 JSONL 필드값은 `"Agent"`)
   - 각 엔트리에서 `{tool_use.id, input.subagent_type, input.description, timestamp}` 추출
   - Map<tool_use_id, {agentType, description, timestamp}> 생성
2. 각 subagent JSONL의 첫 user/assistant 엔트리에서 `parentToolUseID` 필드 확인
   - Map에서 조회하여 부모 결정
   - 매핑 성공 → 해당 부모의 `children`에 추가
   - 매핑 실패 → **root에 직접 attach** + `debug.log`에 경고
3. 서브에이전트 내부 JSONL도 동일 로직으로 스캔하면 N단계 중첩 자연 처리됨

## 6. UI Layout

```
┌─ ◉ Agent Execution Tree ──────────────── Session 1/3  [↕] ──────────────┐
│ ▸ C:/projects/my-app   Session 0dbed9d9   ◷ 1h 23m                      │
│ Mode: [Running+Recent]  (a=all toggle)   Showing 5 / 12 agents          │
├──────────────────────────────────────────────────────────────────────────┤
│ ● main (opus-4-6)                                    1h 23m             │
│   🛠 Read:45 Grep:20 Bash:15 Edit:12 Agent:3                            │
│   ├─ ● feature-dev:code-explorer              ◷ 2m 31s  running         │
│   │  │  "Trace the auth middleware flow"                                │
│   │  │  🛠 Glob:3 Grep:8 Read:12                                        │
│   │  └─ ● Explore                             ◷ 45s     running         │
│   │     "Find API endpoints"                                            │
│   │     🛠 Glob:5 Read:7                                                │
│ ▶ ├─ ✓ code-reviewer                          ◷ 1m 5s   done            │
│   │  "Review authentication module"                                     │
│   │  🛠 Read:15 Grep:4                                                  │
│   └─ ✓ claude-code-guide                      ◷ 12s     done            │
│      "MCP toggle context management"                                    │
│      🛠 WebFetch:2                                                      │
├─ Details ────────────────────────────────────────────────────────────────┤
│  Selected: code-reviewer (a2a48...)                                     │
│  Description: Review authentication module                              │
│  Status: ✓ done  •  Started 14:21:08  •  Duration 1m 5s                 │
│  Model: sonnet-4-6  •  Tokens In: 12.4K  Out: 2.1K                      │
│  Last activity: "Completed review. Found 2 issues..."                   │
│  Diagnostics: 0 errors, 0 denied                                        │
├──────────────────────────────────────────────────────────────────────────┤
│  ↑↓:select  [/]:session  a:all  c/e:collapse/expand  ?:help  q:quit     │
└──────────────── [1:Overview] [2:Flow] [3:Config] [4:Tree] ──────────────┘
```

### 6.1 구성

- **상단 헤더(1줄):** 프로젝트/세션/경과시간 + 모드 표시 + 표시 개수
- **트리 영역(가변):** `▶` 커서 + `├─ └─` 들여쓰기 + 노드당 2줄
- **Details 패널(고정 6줄):** 선택된 노드의 상세 진단
- **하단 상태바:** 단축키 힌트
- **탭 바:** 기존 포맷 유지

### 6.2 상태 아이콘

| 아이콘 | 색 | 의미 |
|--------|-----|------|
| `●` | yellow | running |
| `✓` | green | done |
| `✗` | red | error (diagnostics.errors 존재) |
| `⟳` | blue | 최근 완료 (5분 이내) |
| `↻` | cyan | compaction 에이전트 (`acompact-*`) |

## 7. Edge Cases

| 케이스 | 처리 |
|--------|------|
| subagents 폴더 없음 | 빈 root 반환. "No subagents spawned yet" 표시 |
| parentToolUseID 매핑 실패 | root에 직접 attach + debug.log 경고 |
| 동일 tool_use_id 중복 | 첫 번째만 사용, 이후는 fallback |
| 특수 `acompact-*` 에이전트 | 아이콘만 `↻`로 구분 표시 (숨김 기능은 범위 외) |
| 순환 참조 가능성 | `visited` Set로 감지, root에 재attach + 경고 |
| 노드 200개 초과 | blessed scrollable box로 자연 처리 |
| description 너무 김 | 화면 폭 기준 truncate (`…`). Details 패널에서 전체 표시 |
| 세션 전환 중 트리 캐시 | 세션별 `lastModifiedTime` 비교 → 변경된 세션만 재빌드 |
| 선택 노드가 트리에서 사라짐 | 동일 id 재검색 → 없으면 root로 리셋 |
| 갓 시작된 세션 (Agent 호출 없음) | root만 표시 + "Waiting for first tool call…" 힌트 |

## 8. Testing Strategy

### 8.1 Unit tests (`test/tree-builder.test.js`)

Fixture JSONL 4종:

| Fixture | 검증 내용 |
|---------|----------|
| `happy-path` | 메인이 A, B 2개 spawn → 2개 자식 노드 |
| `nested` | A가 또 Agent 호출 → A 자식으로 C 노드 |
| `orphan` | parentToolUseID 매핑 실패 → root에 attach |
| `empty` | subagents 폴더 없음 → root만 반환 |

검증 항목:
- 트리 구조 (parentId, children 관계)
- depth 값
- 시간순 정렬 (startTime asc)
- tokens/tools 집계 정확성
- flatten DFS 순서

### 8.2 Integration smoke
실제 `~/.claude/projects/`의 기존 세션 하나에 빌더 실행 → 크래시 없이 TreeNode 반환 확인 (수동)

### 8.3 수동 UI 검증 체크리스트
- [ ] Tree 탭 진입/이탈 정상
- [ ] ↑↓ 커서 이동, [/] 세션 전환 충돌 없음
- [ ] `a` 토글 시 모드 전환 반영
- [ ] Details 패널이 커서 이동 시 즉시 업데이트
- [ ] 2초 refresh 동안 커서 위치 유지
- [ ] 다중 세션에서 각 세션별 다른 트리
- [ ] 에러 에이전트는 `✗` 아이콘 + Details에 에러 내용

## 9. Open Questions

없음 (설계 승인 시점 기준).

구현 중 발견되는 이슈는 `debug.log`에 기록하고 별도 티켓으로 관리.
