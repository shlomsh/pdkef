/** A plain identifier, which is all an error name may ever be here. */
const SAFE_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/**
 * The top frame of the stack, as `chunk.hash.js:line:column`.
 *
 * This is worth more than the message and leaks less. A message is built out of
 * whatever the thrower was holding, so it needs the whole guard above; a frame
 * is a position in our own built output and can contain nothing else. It is also
 * what actually answers the question - WebKit's `undefined is not a function`
 * says a method is missing but not which, and the frame says exactly where to
 * look. Matched strictly: a built asset filename and two numbers, nothing else,
 * and any frame that is not that shape is dropped rather than trimmed.
 */
const STACK_FRAME = /\/_astro\/([A-Za-z0-9_.-]+\.m?js):(\d+):(\d+)/;

/** Every built-asset frame, top first, each `chunk:line:col`, at most `max`. */
export function stackFrames(error: Error, max = 8): string[] {
  let stack = typeof error.stack === 'string' ? error.stack : '';
  // V8 opens the stack with `Name: message`, and a message can span lines, so a
  // crafted one could hold a line shaped like a frame. Drop that prefix before
  // scanning; WebKit and Gecko stacks carry no message to drop.
  const head = String(error);
  if (stack.startsWith(head)) stack = stack.slice(head.length);
  const frames: string[] = [];
  for (const line of stack.split('\n')) {
    if (frames.length >= max) break;
    const hit = STACK_FRAME.exec(line);
    if (hit) frames.push(`${hit[1]}:${hit[2]}:${hit[3]}`);
  }
  return frames;
}

export function topFrame(error: Error): string {
  return stackFrames(error, 1)[0] ?? '';
}

/**
 * `error.name`, or the constructor's name when the error never set one -
 * `pdf-lib` subclasses `Error` without assigning `name`, so they all arrive as
 * "Error" and the constructor is the only thing that says which one it was.
 * Both are identifiers from the program text (a minified build shortens them,
 * which costs detail and leaks nothing). Anything that is not a plain
 * identifier is discarded rather than trimmed.
 */
export function errorName(error: Error): string {
  const declared = typeof error.name === 'string' && error.name !== 'Error' ? error.name : '';
  const constructed = typeof error.constructor?.name === 'string' ? error.constructor.name : '';
  const candidate = declared || constructed;
  return SAFE_NAME.test(candidate) ? candidate : 'Error';
}
