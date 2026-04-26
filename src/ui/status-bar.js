const blessed = require('neo-blessed');
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
  const tab3 = tab === 3 ? '{bold}{white-bg}{black-fg} 3:Config {/black-fg}{/white-bg}{/bold}' : ' 3:Config ';
  const tab4 = tab === 4 ? '{bold}{white-bg}{black-fg} 4:Metrics {/black-fg}{/white-bg}{/bold}' : ' 4:Metrics ';
  const tab5 = tab === 5 ? '{bold}{white-bg}{black-fg} 5:Tree {/black-fg}{/white-bg}{/bold}' : ' 5:Tree ';
  const tab6 = tab === 6 ? '{bold}{white-bg}{black-fg} 6:Teams {/black-fg}{/white-bg}{/bold}' : ' 6:Teams ';

  const sessionInfo = sessionCount > 1
    ? ((tab === 5 || tab === 6)
        ? `  Session ${sessionIdx + 1}/${sessionCount} [ [ / ] ]`
        : `  Session ${sessionIdx + 1}/${sessionCount} [\u2191\u2193]`)
    : '';

  let filterHint = '';
  if (tab === 2) {
    filterHint = '  {bold}h{/bold}ook {bold}f{/bold}ilter:rules {bold}m{/bold}em {bold}s{/bold}kill {bold}u{/bold}ser';
  } else if (tab === 5) {
    filterHint = '  {bold}\u2191\u2193{/bold}:select  {bold}a{/bold}:all-toggle';
  } else if (tab === 6) {
    filterHint = '  {bold}\u2191\u2193{/bold}:scroll-gantt  {bold}[ ]{/bold}:session';
  }

  bar.setContent(`${tab1}${tab2}${tab3}${tab4}${tab5}${tab6}  {bold}q{/bold}:quit {bold}r{/bold}:refresh {bold}n{/bold}:rename {bold}?{/bold}:help ${seconds}s${sessionInfo}${filterHint}`);
}

module.exports = { createStatusBar, updateStatusBar };
