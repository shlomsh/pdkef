/**
 * Installs a `files`/`value` pair on a file `<input>` that behaves like a real
 * live FileList: once a handler clears the input (`input.value = ''`, the
 * pattern every picker in this repo uses so re-picking the same file still
 * fires `change`), `files` empties too. A plain
 * `Object.defineProperty(input, 'files', { value: [...] })` survives that
 * reset, which let a handler that reads `files` *after* clearing the input
 * ship to production looking green in every test (see CLAUDE.md's file-picker
 * incident). This double actually mimics the browser so that class of bug is
 * caught here.
 */
export function setInputFiles(input, files) {
  const fileArray = Array.from(files);
  let cleared = false;

  Object.defineProperty(input, 'files', {
    configurable: true,
    get: () => (cleared ? [] : fileArray),
  });

  Object.defineProperty(input, 'value', {
    configurable: true,
    get: () => (cleared || fileArray.length === 0 ? '' : `C:\\fakepath\\${fileArray[0].name}`),
    set: (next) => {
      if (next === '') cleared = true;
    },
  });

  input.dispatchEvent(new Event('change', { bubbles: true }));
}
