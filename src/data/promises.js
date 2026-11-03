/**
 * One source for the four promises PDkef makes, so the wording cannot drift
 * between pages. A page may reword a line through PromiseStickers' `line`
 * prop, but may not add a fifth promise.
 */
/** @testSeam */
export const PROMISE_KINDS = ['private', 'free', 'open-source', 'local'];

export const promises = {
  private: { title: 'Private', icon: 'ShieldCheck', tone: 'paper', line: 'Your files stay on your device.' },
  free: { title: 'Free', icon: 'Gift', tone: 'citron', line: 'No account, no watermark, no catch.' },
  'open-source': {
    title: 'Open source',
    icon: 'Code2',
    tone: 'mint',
    line: 'Read every line on GitHub.',
    href: 'https://github.com/shlomsh/pdkef',
  },
  local: { title: 'Local', icon: 'HardDrive', tone: 'paper', line: 'The work happens in your browser, on your device.' },
};
