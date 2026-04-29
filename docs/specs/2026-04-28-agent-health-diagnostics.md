# Agent Health Diagnostics — Design Spec

**Date:** 2026-04-28
**Status:** Draft (awaiting approval)
**Author:** ykm8864

## 1. Motivation

cc-monitor의 현재 Tree 탭(`2026-04-22-agent-execution-tree.md`)은 sub-agent 계층은 보여주지만 **각 agent의 정체/병목/에러 상태**는 진단하지 않는다. 사용자가 `/dev --hotfix` 실행 중 qa-manager sub-agent가 `Tool result missing due to internal error`로 막힌 사례에서 드러났듯, 실시간 모니터링 환경에서 **비정상 상태를 즉시 식별**할 방법이 없다.

본 spec은 cc-monitor에 sub-agent 병목/에러를 자동 감지하고 Tree 탭과 Overview 탭에서 실시간 표시하는 **Agent Health Diagnostics** 기능을 추가한다.

## 2. Goals / Non-Goals

### Goals
- 활성 세션의 sub-agent 비정상 상태를 3종 신호(`internal-error`, `stalled`, `retry-loop`)로 자동 감지
- Tree 탭 노드별 인디케이터(⚠/⏸/♻) + 하단 디테일 패널에 진단 메시지 표시
- Overview 탭에 신규 Health 요약 패널(전체 카운트 + Top 3 issues)
- cc-monitor의 read-only JSONL 파싱 원칙 유지
- 5초 폴링 갱신 (기존 cc-monitor refresh 주기)

### Non-Goals (YAGNI)
- 사운드/토스트 알림 — TUI 색상 + 인디케이터만으로 충분
- Hook 시스템 통합 — JSONL 파싱으로 충분
- 사후 분석 보고서/export — 실시간 모니터링이 주 사용처
- 자동 복구 액션 (예: agent 재호출) — 진단만, 실행은 사용자가 결정
- 메인 agent 자체에 대한 stalled 검사 — user input 대기 가능성과 모호함

## 3. Design Decisions

### 3.1 신호 3종 + 임계값
- `internal-error`: severity = critical. 1회 발생 시 즉시 표시. 패턴 화이트리스트(`references/error-patterns.md`)로 관리하여 향후 추가/수정 가능.
- `stalled`: 5분(warning) / 10분(critical). sub-agent 한정 (메인 agent 제외).
- `retry-loop`: 같은 도구 + 같은 핵심 인자 3회 연속(또는 같은 에러 동반 시 2회). severity = warning.

### 3.2 모듈 분할: health-analyzer 단일 모듈
신호 감지 로직을 `src/parsers/health-analyzer.js` 한 곳에 집중. UI 두 군데(`tree-panel`, `overview-health-panel`)는 동일 health 객체를 소비. 기존 모듈(`subagent-parser`, `tree-builder`, `conversation-parser`)은 변경 최소화.

### 3.3 UI: Tree 탭 + Overview Health 패널 (조합)
- **Tree 탭**: 노드 옆 prefix(⚠/⏸/♻) + 색상(red/yellow/green) + 하단 디테일에 진단 메시지. 노드별 컨텍스트 풍부.
- **Overview Health 패널**: 전체 카운트 + Top 3 issues. 빠른 전반 스캔용. 0 issues일 때는 한 줄로 축소.

### 3.4 데이터 추가 없음
JSONL의 기존 필드(`parentToolUseID`, `timestamp`, `tool_use_result.is_error`, `content`)에서 신호 추출. 새 데이터 소스/hook/process inspection 없음.

### 3.5 False Positive 보호
- completed sub-agent는 stalled 검사에서 제외
- internal-error 패턴은 화이트리스트로 관리 (정규식이 아닌 substring 기준)
- retry-loop은 마지막 N회가 모두 같은 입력일 때만 (과거 한 번 retry된 건 무시)

## 4. Architecture

### 4.1 Data Flow

```
[JSONL files]
     │
     ├──▶ subagent-parser.js (기존, 변경 없음)
     │      • sub-agent 시작/종료/도구 목록 추출
     │
     ▼
  health-analyzer.js (신규)
   • internal-error 감지: tool_use_result.is_error 또는 패턴 매칭
   • stalled 감지: now - lastEntryTimestamp > threshold
   • retry-loop 감지: 같은 도구+인자가 마지막 N회 연속
   • 노드별 health 객체 반환: { status, signals[], worstSeverity }
     │
     ▼
  tree-builder.js (기존, 최소 변경)
   • 트리 조립 후 각 노드에 health 객체 부착
     │
     ▼
  ┌────────────────────┬───────────────────────────┐
  │ tree-panel.js      │ overview-health-panel.js  │
  │ (확장)             │ (신규)                    │
  └────────────────────┴───────────────────────────┘
```

### 4.2 모듈 책임

| 모듈 | 역할 | 변경 |
|---|---|---|
| `subagent-parser.js` | sub-agent 메타 추출 | 변경 없음 |
| `tree-builder.js` | parent-child 트리 조립 | 노드에 health 부착 1줄 추가 |
| **`health-analyzer.js`** | **3종 신호 감지** | **신규** |
| `tree-panel.js` | Tree 탭 렌더링 | 노드 prefix/색상 + 하단 디테일 진단 |
| **`overview-health-panel.js`** | **Overview Health 요약** | **신규** |
| `layout.js` | 패널 배치 | Overview에 health 패널 추가 1줄 |
| `config.js` | 설정 노출 | `healthAnalyzer` 섹션 추가 |

## 5. Health Analyzer 상세 설계

### 5.0 데이터 모델 (cc-monitor 실측 기반, 2026-04-28 정정)

**`parseSubagents()` 결과 객체 (실제 형태)**:
```javascript
{
  id, type, description, model,
  isRunning,                        // boolean (true=running, false=completed)
  startTime, endTime, elapsedMs,
  tokensIn, tokensOut,
  tools,                            // { Read: 12, Bash: 3, ... }
  diagnostics: {
    errors: [],                     // 추출된 에러 메시지 배열
    deniedCount: 0,
    lastActivity: '',               // 마지막 활동 timestamp ISO string (예: '2026-04-28T11:00:00Z')
    lastActivityText: '',           // 마지막 활동 텍스트 (UI Last activity 표시용)
    repeatPattern: null             // { tool, count } 또는 null (이미 감지됨)
  },
  parentToolUseID
}
// 주의: entries는 결과에 노출되지 않음 (parseSubagents 내부에서만 사용)
```

**필드 분리 이유**: 초기 spec은 `lastActivity` 한 필드에 timestamp 의미를 부여했으나, 실제 `subagent-parser.extractDiagnostics`는 텍스트(마지막 assistant text 블록)를 저장하고 `tree-panel`/`subagents-panel`이 이를 텍스트로 표시 중이었다. 의미 충돌 해소를 위해 timestamp(`lastActivity`)와 텍스트(`lastActivityText`)를 분리한다 (2026-04-28 정정).

**health-analyzer는 이 객체 모양 그대로 입력받는다**. entries 가정 제거. 신호별 매핑:
- `internal-error` → `diagnostics.errors` 배열 비검사 + 패턴 화이트리스트 매칭
- `stalled` → `isRunning === true` AND `now - Date.parse(diagnostics.lastActivity) > threshold`
- `retry-loop` → `diagnostics.repeatPattern` 직접 사용 (subagent-parser가 이미 감지함). N=3 임계값은 `subagent-parser.detectRepeatPattern`이 이미 보유.

이 정정 덕분에 retry-loop 로직은 subagent-parser와 중복 없이 활용 가능. internal-error 패턴 화이트리스트만 health-analyzer 고유.

### 5.1 입출력 인터페이스

```javascript
// 입력: parseSubagents 결과의 sub-agent 객체 + 현재 시각
analyzeHealth(subagent, now = Date.now()) {
  return {
    status: "ok" | "warning" | "critical",
    signals: [
      {
        type: "internal-error" | "stalled" | "retry-loop",
        severity: "warning" | "critical",
        message: "5분 12초간 출력 없음 (마지막 도구: Bash)",
        since: "2026-04-28T11:25:00Z",
        evidence: { tool: "Bash", input: "..." }  // optional
      }
    ],
    worstSeverity: "warning" | "critical" | null
  };
}
```

### 5.2 internal-error 감지

```javascript
function detectInternalError(subagent) {
  if (subagent.status !== "completed") return null;
  const lastEntry = subagent.entries.at(-1);
  if (!lastEntry) return null;

  // (1) tool_use_result에 is_error 플래그
  if (lastEntry.toolUseResult?.is_error) {
    return {
      type: "internal-error",
      severity: "critical",
      message: `도구 결과 실패: ${truncate(lastEntry.toolUseResult.content)}`,
      since: lastEntry.timestamp
    };
  }

  // (2) 화이트리스트 패턴 매칭 (substring)
  const ERROR_PATTERNS = loadErrorPatterns();  // references/error-patterns.md
  const text = lastEntry.content?.[0]?.text || "";
  for (const pattern of ERROR_PATTERNS) {
    if (text.includes(pattern)) {
      return {
        type: "internal-error",
        severity: "critical",
        message: `Anthropic 내부 에러: "${pattern}"`,
        since: lastEntry.timestamp
      };
    }
  }
  return null;
}
```

`references/error-patterns.md` 초기 내용:
```
Tool result missing due to internal error
agent stopped unexpectedly
Internal server error
```

### 5.3 stalled 감지

```javascript
function detectStalled(subagent, now, config) {
  if (subagent.status !== "running") return null;
  const lastEntry = subagent.entries.at(-1);
  if (!lastEntry) return null;

  const idleMs = now - new Date(lastEntry.timestamp).getTime();
  if (idleMs >= config.stalledCriticalSec * 1000) {
    return {
      type: "stalled",
      severity: "critical",
      message: `${formatDuration(idleMs)}간 출력 없음 (마지막 도구: ${lastEntry.tool || "?"})`,
      since: lastEntry.timestamp
    };
  }
  if (idleMs >= config.stalledWarningSec * 1000) {
    return {
      type: "stalled",
      severity: "warning",
      message: `${formatDuration(idleMs)}간 출력 없음 (마지막 도구: ${lastEntry.tool || "?"})`,
      since: lastEntry.timestamp
    };
  }
  return null;
}
```

### 5.4 retry-loop 감지

```javascript
function detectRetryLoop(subagent, config) {
  const N = config.retryThresholdN;        // 일반 케이스 (예: 3)
  const M = config.retryWithSameErrorN;    // 에러 동반 케이스 (예: 2)
  const toolUses = subagent.entries.filter((e) => e.type === "tool_use");
  if (toolUses.length === 0) return null;

  function isLoopOfLength(len) {
    const slice = toolUses.slice(-len);
    if (slice.length < len) return false;
    const keys = slice.map(toolKey);
    return keys.every((k) => k === keys[0]);
  }

  // (1) N회 연속 같은 호출
  if (isLoopOfLength(N)) {
    return makeRetrySignal(toolUses.slice(-N), N);
  }

  // (2) M회 연속 같은 호출 + 마지막 결과가 같은 에러
  if (isLoopOfLength(M)) {
    const last = toolUses.slice(-M);
    const allErrored = last.every((tu) => tu.toolUseResult?.is_error === true);
    const sameErrorText = last.every((tu, i, a) =>
      i === 0 || tu.toolUseResult?.content === a[0].toolUseResult?.content);
    if (allErrored && sameErrorText) {
      return makeRetrySignal(last, M, true);
    }
  }
  return null;
}

function makeRetrySignal(slice, count, withError = false) {
  return {
    type: "retry-loop",
    severity: "warning",
    message: `같은 ${slice[0].name} 호출 ${count}회 연속${withError ? " + 동일 에러" : ""}`,
    since: slice[0].timestamp,
    evidence: { tool: slice[0].name, input: toolKey(slice[0]), withError }
  };
}

function toolKey(entry) {
  switch (entry.name) {
    case "Edit": case "Write": case "Read":
      return `${entry.name}:${entry.input.file_path}`;
    case "Bash":
      return `Bash:${(entry.input.command || "").slice(0, 100)}`;
    default:
      return `${entry.name}:${JSON.stringify(entry.input).slice(0, 100)}`;
  }
}
```

### 5.5 통합

```javascript
function analyzeHealth(subagent, now, config) {
  const signals = [
    detectInternalError(subagent),
    detectStalled(subagent, now, config),
    detectRetryLoop(subagent, config)
  ].filter(Boolean);

  const severities = signals.map((s) => s.severity);
  const worstSeverity = severities.includes("critical") ? "critical"
                      : severities.includes("warning") ? "warning"
                      : null;
  return {
    status: worstSeverity || "ok",
    signals,
    worstSeverity
  };
}
```

## 6. UI 상세 설계

### 6.1 Tree 탭 노드 prefix

```
✓  ok        green/default
●  running   default (정상 진행)
⚠  critical  red    (internal-error 또는 stalled critical)
⏸  warning   yellow (stalled warning)
♻  warning   yellow (retry-loop)
```

여러 신호 있으면 worstSeverity 기준 단일 prefix. 모든 신호는 하단 디테일 패널에 나열.

### 6.2 Tree 탭 하단 디테일 패널

```
├─ ▾ Selected: qa-manager ─────────────────────────────┤
│  Status: critical (internal-error)                    │
│  Started: 14:23:05  Last activity: 14:23:48           │
│  Signals:                                              │
│    ⚠ internal-error: Anthropic 내부 에러 ("Tool       │
│      result missing due to internal error")           │
│  Last 3 entries:                                       │
│    14:23:48  tool_use_result  (is_error: true)        │
│    14:23:30  Read .dev/applicable-rules.md            │
│    14:23:15  Read .dev/prd.md                         │
│  Diagnosis: Anthropic 내부 오류. 메인 세션에서        │
│             직접 수행 또는 재호출 권장.               │
└──────────────────────────────────────────────────────┘
```

### 6.3 Overview Health 패널

```
├─ ⚕ Sub-agent Health ────────────────────────────────┤
│   ✓ OK: 8   ⚠ Critical: 1   ⏸ Stalled: 1   ♻ Retry: 1│
│   Top issues:                                         │
│     ⚠ qa-manager     internal-error  (Tool result …)  │
│     ⏸ coder          stalled 5m 12s  (last: Bash)     │
│     ♻ researcher     retry-loop ×3   (grep)           │
└──────────────────────────────────────────────────────┘
```

이슈 0건이면 한 줄로 축소: `⚕ Sub-agent Health: All OK (8 sub-agents healthy)`.

## 7. Configuration

`src/config.js`에 섹션 추가:

```javascript
healthAnalyzer: {
  stalledWarningSec: 300,        // 5분
  stalledCriticalSec: 600,       // 10분
  retryThresholdN: 3,            // 같은 도구+인자 N회 연속이면 retry-loop
  retryWithSameErrorN: 2,        // 같은 에러 동반 시 더 적은 N도 트리거
  errorPatternsPath: "references/error-patterns.md",
  topIssuesCount: 3              // Overview Health 패널의 Top N
}
```

## 8. Testing Strategy

### 8.1 Fixture 기반 단위 테스트

`test/fixtures/health/`에 anonymized JSONL 슬라이스 4종:

- `internal-error.jsonl`: tool_use_result.is_error true 1건 + 정상 1건
- `stalled.jsonl`: running + 마지막 timestamp 6분 전 / 1분 전
- `retry-loop.jsonl`: 같은 Bash command 3회 / 다른 인자 3회
- `clean.jsonl`: ok 상태만

각 fixture에 대해 `health-analyzer.{detectInternalError, detectStalled, detectRetryLoop}` 단위 호출 → 기대 신호 객체 비교.

### 8.2 통합 테스트

- `tree-builder` 결과의 모든 노드에 health 객체 부착되었는지
- completed sub-agent가 stalled 검사에서 제외되는지
- 패턴 화이트리스트 외 텍스트는 internal-error로 판정 안 되는지

### 8.3 UI 스냅샷

`tree-panel.renderNode(node)` / `overview-health-panel.render(allSubagents)` 결과 문자열을 fixture 파일로 비교. blessed 태그(`{red-fg}`)도 그대로 비교.

## 9. Implementation Order

| 단계 | 산출물 | 의존 | 검증 |
|---|---|---|---|
| 1 | `health-analyzer.js` + fixture 4종 + 단위 테스트 | 독립 | `npm test` 통과 |
| 2 | `tree-builder.js` 수정 — 노드에 health 부착 | 1 | 통합 테스트 |
| 3 | `tree-panel.js` 확장 — prefix/색상 + 디테일 진단 | 1, 2 | 실제 cc-monitor 실행으로 시각 확인 |
| 4 | `overview-health-panel.js` 신규 + layout 통합 | 1, 2 | 실제 cc-monitor 실행으로 시각 확인 |

각 단계 완료 후 cc-monitor 실행해서 실제 활성 세션에 신호가 정확히 표시되는지 확인.

## 10. Open Questions / Future Work

- **에러 패턴 자동 학습**: 처음에는 화이트리스트로 시작하되, Homunculus처럼 자주 보이는 에러 메시지를 자동 수집해 화이트리스트 후보 제안하는 후속 기능 가능. 본 spec 범위 외.
- **메인 agent 비정상 종료 감지**: 메인 agent도 hang 가능. 단 user input 대기와 구분이 어려워 본 spec에서 제외. 후속 spec에서 별도 신호로 다룰 수 있음.
- **신호 무음 처리(suppress)**: 사용자가 "이 노드의 stalled는 의도된 거니 무시"하는 UI는 미포함. 필요 시 후속.

## 11. References

- 선행 spec: `docs/specs/2026-04-22-agent-execution-tree.md` (Tree 탭의 데이터 모델 및 trigger)
- cc-monitor 원칙: `README.md`의 "JSONL 파일 read-only 파싱"
- 사용자 동기 사례: `/dev --hotfix` 실행 중 qa-manager sub-agent의 `Tool result missing due to internal error` (2026-04-28)
