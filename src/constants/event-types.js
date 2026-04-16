const EVENT_TYPES = {
  HOOK_SUCCESS: 'hook',
  HOOK_CANCELLED: 'hook_cancel',
  RULE_LOADED: 'rule',
  MEMORY_LOADED: 'memory',
  SKILL_LISTED: 'skill_list',
  SKILL_CALLED: 'skill_call',
  TOOL_USE: 'tool',
  USER_MSG: 'user',
  ASSISTANT_MSG: 'assistant',
  COMPACT: 'compact',
};

module.exports = { EVENT_TYPES };
