const { createSection } = require('./layout');
const config = require('../config');
const I = config.ICONS;

const ICONS = {
  rules: '\u2630',   // ☰
  hooks: '\u26A1',   // ⚡
  skills: '\u2605',  // ★
  plugins: '\u25C8', // ◈
};

function createConfigSummaryPanel(screen) {
  const box = createSection({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 5,
    label: ` ${I.session} Config Summary `,
    tags: true,
  });
  return box;
}

function updateConfigSummaryPanel(box, configData) {
  const rulesCount = configData.rules ? configData.rules.length : 0;
  const skills = configData.skills || [];
  const customSkills = skills.filter(s => s.isCustom).length;
  const pluginSkills = skills.filter(s => !s.isCustom).length;
  const hooksCount = configData.hooks ? configData.hooks.length : 0;
  const pluginsCount = configData.plugins ? configData.plugins.length : 0;
  const model = configData.model || 'unknown';

  const sep = ` {gray-fg}${I.separator}{/gray-fg} `;
  const line1 = [
    `{yellow-fg}${ICONS.rules}Rule{/yellow-fg} {bold}${rulesCount}{/bold}`,
    `{cyan-fg}${ICONS.hooks}Hook{/cyan-fg} {bold}${hooksCount}{/bold}`,
    `{green-fg}${ICONS.skills}Skill{/green-fg} {bold}${skills.length}{/bold} {gray-fg}(${customSkills}+${pluginSkills}){/gray-fg}`,
    `{magenta-fg}${ICONS.plugins}Plugin{/magenta-fg} {bold}${pluginsCount}{/bold}`,
  ].join(sep);

  const line2 = `{gray-fg}Model{/gray-fg} {bold}${model}{/bold}`;

  box.setContent(`${line1}\n${line2}`);
}

function createConfigTreePanel(screen) {
  const box = createSection({
    parent: screen,
    top: 5,
    left: 0,
    width: '100%',
    height: '100%-7',
    label: ` ${I.folder} Config Tree `,
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      style: { bg: 'cyan' },
    },
    mouse: true,
    keys: false,
  });
  return box;
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '\u2026' : str;
}

function renderRulesTree(rules) {
  if (!rules || rules.length === 0) return [];
  const lines = [];
  lines.push(`  {yellow-fg}{bold}${ICONS.rules} Rules (${rules.length}){/bold}{/yellow-fg}`);

  rules.forEach((rule, i) => {
    const isLast = i === rules.length - 1;
    const branch = isLast ? '\u2514\u2500\u2500' : '\u251C\u2500\u2500';
    const cont = isLast ? '   ' : '\u2502  ';
    lines.push(`  {gray-fg}${branch}{/gray-fg} {cyan-fg}${rule.name}{/cyan-fg}`);
    if (rule.description) {
      lines.push(`  {gray-fg}${cont}   {/gray-fg}{gray-fg}${truncate(rule.description, 70)}{/gray-fg}`);
    }
  });

  return lines;
}

function renderHooksTree(hooks) {
  if (!hooks || hooks.length === 0) return [];
  const lines = [];
  lines.push(`  {yellow-fg}{bold}${ICONS.hooks} Hooks (${hooks.length}){/bold}{/yellow-fg}`);

  const grouped = {};
  for (const hook of hooks) {
    const event = hook.event || 'Unknown';
    const matcher = hook.matcher || null;
    const key = matcher ? `${event} [${matcher}]` : event;
    if (!grouped[key]) {
      grouped[key] = { event, matcher, scripts: [] };
    }
    grouped[key].scripts.push(hook.scriptName || hook.command || 'unknown');
  }

  const groups = Object.values(grouped);
  groups.forEach((group, gi) => {
    const isLastGroup = gi === groups.length - 1;
    const groupBranch = isLastGroup ? '\u2514\u2500\u2500' : '\u251C\u2500\u2500';
    const groupCont = isLastGroup ? '    ' : '\u2502   ';

    let label = `{green-fg}${group.event}{/green-fg}`;
    if (group.matcher) {
      label += ` {magenta-fg}[${group.matcher}]{/magenta-fg}`;
    }
    lines.push(`  {gray-fg}${groupBranch}{/gray-fg} ${label}`);

    group.scripts.forEach((script, si) => {
      const isLastScript = si === group.scripts.length - 1;
      const scriptBranch = isLastScript ? '\u2514\u2500\u2500' : '\u251C\u2500\u2500';
      lines.push(`  {gray-fg}${groupCont}${scriptBranch}{/gray-fg} {cyan-fg}${script}{/cyan-fg}`);
    });
  });

  return lines;
}

function renderSkillsTree(skills) {
  if (!skills || skills.length === 0) return [];

  const custom = skills.filter(s => s.isCustom);
  const plugin = skills.filter(s => !s.isCustom);
  const lines = [];
  lines.push(`  {yellow-fg}{bold}${ICONS.skills} Skills (${skills.length}){/bold}{/yellow-fg}  {gray-fg}custom ${custom.length} | plugin ${plugin.length}{/gray-fg}`);

  const hasPlugin = plugin.length > 0;

  if (custom.length > 0) {
    const customBranch = hasPlugin ? '\u251C\u2500\u2500' : '\u2514\u2500\u2500';
    const customCont = hasPlugin ? '\u2502  ' : '   ';
    lines.push(`  {gray-fg}${customBranch}{/gray-fg} {green-fg}{bold}Custom (${custom.length}){/bold}{/green-fg}`);
    custom.forEach((skill, i) => {
      const isLast = i === custom.length - 1;
      const branch = isLast ? '\u2514\u2500\u2500' : '\u251C\u2500\u2500';
      const cont = isLast ? '   ' : '\u2502  ';
      lines.push(`  {gray-fg}${customCont}${branch}{/gray-fg} {cyan-fg}${skill.name}{/cyan-fg}`);
      if (skill.description) {
        lines.push(`  {gray-fg}${customCont}${cont}   {/gray-fg}{gray-fg}${truncate(skill.description, 70)}{/gray-fg}`);
      }
    });
  }

  if (plugin.length > 0) {
    lines.push(`  {gray-fg}\u2514\u2500\u2500{/gray-fg} {magenta-fg}{bold}Plugin (${plugin.length}){/bold}{/magenta-fg}`);
    plugin.forEach((skill, i) => {
      const isLast = i === plugin.length - 1;
      const branch = isLast ? '\u2514\u2500\u2500' : '\u251C\u2500\u2500';
      const cont = isLast ? '   ' : '\u2502  ';
      lines.push(`  {gray-fg}   ${branch}{/gray-fg} {cyan-fg}${skill.name}{/cyan-fg}`);
      if (skill.description) {
        lines.push(`  {gray-fg}   ${cont}   {/gray-fg}{gray-fg}${truncate(skill.description, 70)}{/gray-fg}`);
      }
    });
  }

  return lines;
}

function renderPluginsTree(plugins) {
  if (!plugins || plugins.length === 0) return [];
  const lines = [];
  lines.push(`  {yellow-fg}{bold}${ICONS.plugins} Plugins (${plugins.length}){/bold}{/yellow-fg}`);

  plugins.forEach((plugin, i) => {
    const isLast = i === plugins.length - 1;
    const branch = isLast ? '\u2514\u2500\u2500' : '\u251C\u2500\u2500';
    let label = `{cyan-fg}${plugin.name}{/cyan-fg}`;
    if (plugin.marketplace) {
      label += ` {gray-fg}(${plugin.marketplace}){/gray-fg}`;
    }
    lines.push(`  {gray-fg}${branch}{/gray-fg} ${label}`);
  });

  return lines;
}

function updateConfigTreePanel(box, configData) {
  if (!configData) {
    box.setContent('{gray-fg}  (no config data){/gray-fg}');
    return;
  }

  const sections = [
    renderRulesTree(configData.rules),
    renderHooksTree(configData.hooks),
    renderSkillsTree(configData.skills),
    renderPluginsTree(configData.plugins),
  ].filter(s => s.length > 0);

  const lines = [];
  sections.forEach((section, i) => {
    if (i > 0) lines.push('');
    lines.push(...section);
  });

  if (lines.length === 0) {
    box.setContent('{gray-fg}  (no config data){/gray-fg}');
    return;
  }

  box.setContent(lines.join('\n'));
}

module.exports = {
  createConfigSummaryPanel, updateConfigSummaryPanel,
  createConfigTreePanel, updateConfigTreePanel,
};
