const path = require('path');
const { readJsonlIncremental } = require('../utils/jsonl-reader');
const { parseTimestamp, formatTime, formatTokenCount } = require('../utils/time-format');
const { EVENT_TYPES } = require('../constants/event-types');

function parseFlowEvents(jsonlPath) {
  const entries = readJsonlIncremental(jsonlPath);
  const events = [];
  let msgIndex = 0;

  for (const entry of entries) {
    const ts = entry.timestamp ? parseTimestamp(entry.timestamp) : null;
    const timeStr = ts ? formatTime(ts) : '';

    if (entry.type === 'user') {
      // 시스템 주입 메시지(non-string content) 건너뛰기
      const msg = entry.message;
      if (!msg || typeof msg.content !== 'string') continue;

      msgIndex++;
      const text = extractUserText(entry);

      // 빈 메시지나 시스템 명령어(/clear 등)는 간략 표시
      const isCommand = text.startsWith('/') || text.includes('command-name') || text.trim() === '';
      if (isCommand && text.trim() === '') continue; // 완전히 빈 메시지 스킵

      const displayText = text || '(empty)';
      events.push({
        type: EVENT_TYPES.USER_MSG,
        ts, timeStr, msgIndex,
        label: truncate(displayText, 120),
        detail: displayText,
        isCommand,
      });
    }

    if (entry.type === 'system' && entry.subtype === 'compact_boundary') {
      const meta = entry.compactMetadata || {};
      const pre = formatTokenCount(meta.preTokens || 0);
      const post = formatTokenCount(meta.postTokens || 0);
      const dur = meta.durationMs ? Math.round(meta.durationMs / 1000) : 0;
      events.push({
        type: EVENT_TYPES.COMPACT,
        ts, timeStr,
        label: `${pre} \u2192 ${post} (${dur}s)`,
        detail: `Context compaction: ${pre} → ${post}, took ${dur}s`,
        preTokens: meta.preTokens || 0,
        postTokens: meta.postTokens || 0,
      });
    }

    if (entry.type === 'assistant' && entry.message) {
      const content = entry.message.content;
      if (!Array.isArray(content)) continue;

      for (const block of content) {
        if (block.type === 'tool_use' && block.name === 'Skill') {
          const skillName = block.input && block.input.skill || 'unknown';
          events.push({
            type: EVENT_TYPES.SKILL_CALLED,
            ts, timeStr,
            label: skillName,
            detail: `Skill invoked: ${skillName}`,
          });
        }
      }
    }

    if (entry.type === 'attachment') {
      const att = entry.attachment || {};

      if (att.type === 'hook_success') {
        const hookEvent = att.hookEvent || '';
        const hookName = att.hookName || '';
        events.push({
          type: EVENT_TYPES.HOOK_SUCCESS,
          ts, timeStr,
          label: hookName || hookEvent,
          detail: truncate(att.content || '', 80),
          hookEvent,
        });
      }

      if (att.type === 'hook_cancelled') {
        const hookName = att.hookName || '';
        events.push({
          type: EVENT_TYPES.HOOK_CANCELLED,
          ts, timeStr,
          label: hookName,
          detail: 'cancelled (timeout or skip)',
        });
      }

      if (att.type === 'nested_memory') {
        const filePath = att.path || '';
        const fileName = path.basename(filePath);
        const isRule = filePath.includes('rules');
        events.push({
          type: isRule ? EVENT_TYPES.RULE_LOADED : EVENT_TYPES.MEMORY_LOADED,
          ts, timeStr,
          label: fileName,
          detail: filePath,
        });
      }

      if (att.type === 'skill_listing') {
        const content = att.content || '';
        const count = (content.match(/^- /gm) || []).length;
        events.push({
          type: EVENT_TYPES.SKILL_LISTED,
          ts, timeStr,
          label: `${count} skills available`,
          detail: `Loaded ${count} skill definitions`,
        });
      }

      if (att.type === 'hook_additional_context') {
        events.push({
          type: EVENT_TYPES.HOOK_SUCCESS,
          ts, timeStr,
          label: 'SessionStart context',
          detail: truncate(Array.isArray(att.content) ? att.content[0] : (att.content || ''), 80),
          hookEvent: 'SessionStart',
        });
      }

      const handled = ['hook_success', 'hook_cancelled', 'nested_memory', 'skill_listing', 'hook_additional_context'];
      if (att.type && !handled.includes(att.type)) {
        const { recordSchemaMiss } = require('../utils/schema-guard');
        recordSchemaMiss('flow-parser.attachment', { type: att.type });
      }
    }
  }

  return events;
}

function buildFlowSummary(events) {
  const counts = {};
  for (const e of events) {
    counts[e.type] = (counts[e.type] || 0) + 1;
  }
  return {
    totalEvents: events.length,
    hooks: (counts[EVENT_TYPES.HOOK_SUCCESS] || 0) + (counts[EVENT_TYPES.HOOK_CANCELLED] || 0),
    hooksSuccess: counts[EVENT_TYPES.HOOK_SUCCESS] || 0,
    hooksCancelled: counts[EVENT_TYPES.HOOK_CANCELLED] || 0,
    rules: counts[EVENT_TYPES.RULE_LOADED] || 0,
    memories: counts[EVENT_TYPES.MEMORY_LOADED] || 0,
    skillCalls: counts[EVENT_TYPES.SKILL_CALLED] || 0,
    userMsgs: counts[EVENT_TYPES.USER_MSG] || 0,
    compactions: counts[EVENT_TYPES.COMPACT] || 0,
  };
}

function extractUserText(entry) {
  if (!entry.message) return '';
  const msg = entry.message;
  let raw = '';
  if (typeof msg === 'string') {
    raw = msg;
  } else if (msg.content) {
    if (typeof msg.content === 'string') {
      raw = msg.content;
    } else if (Array.isArray(msg.content)) {
      const textBlock = msg.content.find(b => b.type === 'text');
      raw = textBlock ? textBlock.text : '';
    }
  }
  // XML 태그 제거, 시스템 메시지 제거
  raw = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  // system-reminder, local-command-caveat 등 시스템 텍스트 제거
  raw = raw.replace(/Caveat:.*?unless the user explicitly asks you to\./s, '').trim();
  return raw;
}

function truncate(str, maxLen) {
  if (!str) return '';
  const oneLine = str.replace(/\n/g, ' ').trim();
  return oneLine.length > maxLen ? oneLine.substring(0, maxLen) + '\u2026' : oneLine;
}

module.exports = { parseFlowEvents, buildFlowSummary };
