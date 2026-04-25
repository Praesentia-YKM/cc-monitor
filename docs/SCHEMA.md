# Claude Code JSONL Schema — cc-monitor 의존 필드

Claude Code가 `~/.claude/projects/<project>/<sessionId>.jsonl`에 기록하는 포맷은 **비공식**이며 버전 업데이트에 따라 변경될 수 있다. 이 문서는 cc-monitor가 **현재 버전에서** 의존하는 필드만 나열한다.

포맷이 변경되면 `debug.log`에 `schema_miss` 경고가 누적된다. 이 문서를 업데이트하고 해당 파서를 수정한다.

## 세션 메타 (`~/.claude/sessions/*.json`)

| 필드 | 사용처 |
|------|--------|
| `pid` | `session-finder.isProcessAlive` |
| `sessionId` | `findSessionJsonl`, UI 표시 |
| `startedAt` | `session-finder.verifyProcessIdentity`, `calcAge` |
| `cwd` | UI 표시, 세션 그루핑 |
| `model` | UI 표시 (optional) |

## 메인 JSONL 엔트리

모든 엔트리는 `type` 필드 보유.

### `type: "user"`
- `timestamp`
- `message.content` — string 또는 array
  - string: user prompt
  - array: `tool_result` 블록들 (`is_error`, `content`)

### `type: "assistant"`
- `timestamp`
- `message.model`
- `message.content[]`
  - `type: "text"` + `text`
  - `type: "tool_use"` + `name` + `id` + `input`
- `message.usage`
  - `input_tokens`, `output_tokens`
  - `cache_creation_input_tokens`, `cache_read_input_tokens`

### `type: "system", subtype: "compact_boundary"`
- `timestamp`
- `compactMetadata.preTokens`
- `compactMetadata.postTokens`
- `compactMetadata.durationMs`

### `type: "attachment"`
- `attachment.type`
  - `hook_success` + `hookEvent` + `hookName` + `content`
  - `hook_cancelled` + `hookName`
  - `nested_memory` + `path`
  - `skill_listing` + `content`
  - `hook_additional_context` + `content`

## 서브에이전트 JSONL

`~/.claude/projects/<project>/<sessionId>/subagents/<agentId>.jsonl` + `.meta.json`.

### `.meta.json`
- `agentType`
- `description`

### 엔트리
- 메인과 동일 구조
- `parentToolUseID` — 부모 Agent tool_use의 id (트리 재구성용)
- `type: "end-of-session"` — 완료 표시

## 기타

- `~/.claude/history.jsonl` — 스킬 호출 히스토리 (history-parser)
- `~/.claude/powerline/usage/today.json` — 오늘 비용 총액 (cost-parser)
- `~/.claude/settings.json` — hooks, permissions 정의 (config-parser)

## 검증

`cc-monitor --debug` 실행 후 `debug.log`에서 `schema_miss` 경고를 확인한다. 경고가 있으면:

1. 해당 필드를 이 문서에 반영
2. 파서를 업데이트하여 새 스키마 대응
3. 가능하면 `hasField` 가드를 추가해 향후 변경 감지
