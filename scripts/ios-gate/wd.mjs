// A minimal W3C WebDriver client over fetch for the iOS gate (SNG-07). Appium's
// XCUITest driver speaks plain W3C plus a few `mobile:` execute commands, so a
// client library would add a large dependency tree for about forty lines.

export class WebDriverError extends Error {}

async function call(base, method, path, body) {
  const response = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json();
  if (json.value && json.value.error) {
    throw new WebDriverError(`${method} ${path}: ${json.value.error}: ${String(json.value.message).split('\n')[0]}`);
  }
  return json.value;
}

/** Open a session on the Appium server at `base` and return its commands. */
export async function openSession(base, capabilities) {
  const created = await call(base, 'POST', '/session', { capabilities: { alwaysMatch: capabilities, firstMatch: [{}] } });
  return sessionCommands(base, created.sessionId, created.capabilities);
}

/** The commands of an existing session (also used to re-attach to one while debugging). */
export function sessionCommands(base, id, capabilities = {}) {
  const s = (method, path, body) => call(base, method, `/session/${id}${path}`, body);
  const session = {
    id,
    capabilities,
    go: (url) => s('POST', '/url', { url }),
    /** Run `script` (a function body, `arguments` holds `args`) in the current context. */
    js: (script, ...args) => s('POST', '/execute/sync', { script, args }),
    /** Run `script` with a callback as its last argument. */
    jsAsync: (script, ...args) => s('POST', '/execute/async', { script, args }),
    contexts: () => s('GET', '/contexts'),
    context: () => s('GET', '/context'),
    setContext: (name) => s('POST', '/context', { name }),
    /** W3C actions: in the native context, x/y are screen points. */
    actions: async (actions) => {
      await s('POST', '/actions', { actions });
      await s('DELETE', '/actions').catch(() => {});
    },
    find: (using, value) => s('POST', '/element', { using, value }).then((e) => Object.values(e)[0]),
    findAll: (using, value) => s('POST', '/elements', { using, value }).then((list) => list.map((e) => Object.values(e)[0])),
    rectOf: (element) => s('GET', `/element/${element}/rect`),
    click: (element) => s('POST', `/element/${element}/click`, {}),
    screenshot: () => s('GET', '/screenshot'),
    windowRect: () => s('GET', '/window/rect'),
    timeouts: (value) => s('POST', '/timeouts', value),
    /** The native accessibility tree (XML) - useful to locate a piece of Safari's
     * own chrome (the form next/previous bar, an alert) that has no web DOM. */
    source: () => s('GET', '/source'),
    quit: () => s('DELETE', ''),
  };
  /** Run `fn` in the native context, then return to the web context it came from. */
  session.native = async (fn) => {
    const web = await session.context();
    await session.setContext('NATIVE_APP');
    try {
      return await fn();
    } finally {
      await session.setContext(web);
    }
  };
  return session;
}

export async function serverStatus(base) {
  try {
    return await call(base, 'GET', '/status');
  } catch {
    return null;
  }
}
