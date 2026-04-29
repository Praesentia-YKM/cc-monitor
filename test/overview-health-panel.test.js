const assert = require('assert');
const blessed = require('neo-blessed');
const path = require('path');
const os = require('os');

const screen = blessed.screen({
  smartCSR: false,
  log: path.join(os.tmpdir(), 'cc-monitor-test.log'),
  dump: false,
  warnings: false
});

const { createHealthPanel } = require('../src/ui/overview-health-panel');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e.message}`); }
}

console.log('\n=== ui/overview-health-panel ===');

test('renders no-active-sub-agents text when list empty', () => {
  const panel = createHealthPanel(screen, { top: 0, left: 0, width: 80, height: 6 });
  panel.render([]);
  assert(panel.box.getContent().includes('No active sub-agents'));
});

test('renders All OK when no issues', () => {
  const panel = createHealthPanel(screen, { top: 0, left: 0, width: 80, height: 6 });
  panel.render([{ agentType: 'x', health: { status: 'ok', signals: [] } }]);
  assert(panel.box.getContent().includes('All OK'));
});

test('renders critical count and top issue', () => {
  const panel = createHealthPanel(screen, { top: 0, left: 0, width: 80, height: 6 });
  panel.render([
    { agentType: 'qa-manager',
      health: { status: 'critical', worstSeverity: 'critical',
                signals: [{ type: 'internal-error', severity: 'critical', message: 'boom' }] } }
  ]);
  const c = panel.box.getContent();
  assert(c.includes('Critical: 1'));
  assert(c.includes('qa-manager'));
  assert(c.includes('boom'));
});

test('renders warning + critical mix sorted by severity', () => {
  const panel = createHealthPanel(screen, { top: 0, left: 0, width: 80, height: 8 });
  panel.render([
    { agentType: 'a', health: { status: 'warning', worstSeverity: 'warning',
        signals: [{ type: 'retry-loop', severity: 'warning', message: 'looping' }] } },
    { agentType: 'b', health: { status: 'critical', worstSeverity: 'critical',
        signals: [{ type: 'stalled', severity: 'critical', message: 'frozen' }] } },
  ]);
  const c = panel.box.getContent();
  assert(c.includes('Critical: 1'));
  assert(c.includes('Warning: 1'));
  const fIdx = c.indexOf('frozen');
  const lIdx = c.indexOf('looping');
  assert(fIdx >= 0 && lIdx >= 0 && fIdx < lIdx, 'critical issue should appear before warning');
});

screen.destroy();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
