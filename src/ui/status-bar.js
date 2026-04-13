const blessed = require('blessed');
const config = require('../config');

function createStatusBar(screen) {
  const bar = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: '',
    tags: true,
    style: {
      fg: 'white',
      bg: 'blue',
    },
  });
  return bar;
}

function updateStatusBar(bar, pollInterval, sessionCount, sessionIdx, currentTab) {
  const seconds = Math.round(pollInterval / 1000);
  const tab = currentTab || 1;

  const tab1 = tab === 1 ? '{bold}{white-bg}{black-fg} 1:Overview {/black-fg}{/white-bg}{/bold}' : ' 1:Overview ';
  const tab2 = tab === 2 ? '{bold}{white-bg}{black-fg} 2:Flow {/black-fg}{/white-bg}{/bold}' : ' 2:Flow ';

  const sessionInfo = sessionCount > 1
    ? `  Session ${sessionIdx + 1}/${sessionCount} [\u2191\u2193]`
    : '';

  const filterHint = tab === 2 ? '  {bold}h{/bold}ook {bold}f{/bold}ilter:rules {bold}m{/bold}em {bold}s{/bold}kill {bold}u{/bold}ser' : '';

  bar.setContent(`${tab1}${tab2}  {bold}q{/bold}:quit {bold}r{/bold}:refresh {bold}n{/bold}:rename {bold}?{/bold}:help ${seconds}s${sessionInfo}${filterHint}`);
}

module.exports = { createStatusBar, updateStatusBar };
