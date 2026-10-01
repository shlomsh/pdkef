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

/**
 * A whole stack line that is one frame in our own built output, in either
 * engine's shape and with nothing else on the line, bounded like the schema's
 * FRAME so an oversized frame is skipped rather than sinking the report:
 * V8 `    at fn (https://host/_astro/c.js:1:2)` or `    at https://host/_astro/c.js:1:2`;
 * JSC and Gecko `fn@https://host/_astro/c.js:1:2`, WebKit's async `async fn@...`,
 * Gecko's `async*fn@...`, `@https://...` or a bare URL.
 */
const FRAME_LINE =
  /^\s*(?:at\s+(?:[^()]*\()?|(?:async\s+)?[^\s@()]*@)?https?:\/\/[^/\s]+\/_astro\/([A-Za-z0-9_.-]{1,120}\.m?js):(\d{1,7}):(\d{1,7})\)?\s*$/;

/** V8 is the engine that opens its stack with the message. */
const V8_FRAME = /\n\s+at /;

/** Every built-asset frame, top first, each `chunk:line:col`, at most `max`. */
export function stackFrames(error: Error, max = 8): string[] {
  let stack = typeof error.stack === 'string' ? error.stack : '';
  // V8 opens the stack with `Name: message`, and a message can span lines, so a
  // crafted one could hold a line shaped like a frame. Cut through the message
  // itself rather than matching the header: many errors (pdf.js's, ours) set
  // `name` after construction, so the header no longer equals String(error).
  // WebKit and Gecko stacks carry no message to cut.
  const message = typeof error.message === 'string' ? error.message : '';
  if (message && V8_FRAME.test(stack)) {
    const at = stack.indexOf(message);
    if (at >= 0 && at < 256) stack = stack.slice(at + message.length);
  }
  const frames: string[] = [];
  for (const line of stack.split('\n')) {
    if (frames.length >= max) break;
    const hit = FRAME_LINE.exec(line);
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
