// Unit coverage for scripts/check-navigating-away.mjs (DEBT-21): literal source
// fixtures through the guard's own exported findViolations, one per real
// navigation site converted back to a plain useState(false), then the shapes
// that must stay green. The last test walks the real tree, pinning "today's code
// passes with no allowlist".
import { describe, expect, it } from 'vitest';
import { findViolations, checkTree } from './check-navigating-away.mjs';

const FILE = 'src/fixture/Fixture.tsx';
const flags = (source) => findViolations(source, FILE).map(({ flag }) => flag);

describe('navigating-away guard: the four real sites as a plain useState(false)', () => {
  it('fails FileDropzone: handOff sets busy, then assigns window.location.href', () => {
    const source = `
      export default function FileDropzone() {
        const [error, setError] = useState('');
        const [busy, setBusy] = useState(false);
        const handOff = async (file) => {
          setBusy(true);
          try {
            const saved = await saveHandoff(tool, file);
            if (!saved) throw new Error('handoff');
            window.location.href = withFillModeParam(toolHref(tool), window.location.search);
          } catch {
            setError(messages.handoffFailed);
            setBusy(false);
          }
        };
        const openRecent = (recent) => {
          setBusy(true);
          window.location.href = toolHref(recent.tool);
        };
        return null;
      }`;
    expect(findViolations(source, FILE)).toEqual([{ file: FILE, line: 4, flag: 'busy' }]);
  });

  it('fails Merge: performHandoff sets handoffBusy, then calls the injected navigate', () => {
    const source = `
      export default function PdfMergeTool({ navigate = (href) => { window.location.href = href; } }) {
        const [handoffBusy, setHandoffBusy] = useState(false);
        const [handoffFailed, setHandoffFailed] = useState(false);
        const performHandoff = useCallback(async (tool) => {
          setHandoffBusy(true);
          setHandoffFailed(false);
          try {
            const saved = await saveHandoff(tool, {});
            if (!saved) throw new Error('handoff');
            navigate(hrefs[tool]);
          } catch {
            setHandoffFailed(true);
            setHandoffBusy(false);
          }
        }, []);
        return null;
      }`;
    expect(flags(source)).toEqual(['handoffBusy']);
  });

  it('fails Split: handoffToCompress sets handoffBusy, then calls the injected navigate', () => {
    const source = `
      export default function PdfSplitTool({ navigate = (href) => { window.location.href = href; } }) {
        const [handoffBusy, setHandoffBusy] = useState(false);
        const handoffToCompress = async () => {
          if (handoffBusy) return;
          setHandoffBusy(true);
          try {
            await saveHandoff('compress', {});
            navigate('/compress/');
          } catch {
            setHandoffBusy(false);
          }
        };
        return null;
      }`;
    expect(flags(source)).toEqual(['handoffBusy']);
  });

  it('fails Redact: requestHandoff sets handoffBusy, then assigns window.location.href', () => {
    const source = `
      export default function PdfRedactTool() {
        const [handoffBusy, setHandoffBusy] = useState(false);
        const requestHandoff = async (tool) => {
          if (handoffBusy) return;
          setHandoffBusy(true);
          try {
            await saveHandoff(tool, {});
            window.location.href = \`/\${tool}/\`;
          } catch (err) {
            console.error(err);
            setHandoffBusy(false);
          }
        };
        return null;
      }`;
    expect(flags(source)).toEqual(['handoffBusy']);
  });
});

describe('navigating-away guard: the other navigation forms', () => {
  const wrap = (navigation) => `
    function Tool() {
      const [leaving, setLeaving] = useState(false);
      const go = () => { setLeaving(true); ${navigation} };
      return null;
    }`;

  it.each([
    ['location.href', "location.href = '/x/';"],
    ['window.location', "window.location = '/x/';"],
    ['document.location.href', "document.location.href = '/x/';"],
    ['location.assign', "window.location.assign('/x/');"],
    ['location.replace', "location.replace('/x/');"],
    ['props.navigate', "props.navigate('/x/');"],
  ])('fails %s', (_name, navigation) => {
    expect(flags(wrap(navigation))).toEqual(['leaving']);
  });

  it('fails a setter called through an updater that returns true', () => {
    const source = `
      function Tool() {
        const [leaving, setLeaving] = useState(false);
        const go = () => { setLeaving(() => true); navigate('/x/'); };
        return null;
      }`;
    expect(flags(source)).toEqual(['leaving']);
  });

  it('fails when the flag is set in an enclosing function and the navigation is in a callback', () => {
    const source = `
      function Tool() {
        const [leaving, setLeaving] = useState(false);
        const go = async () => {
          setLeaving(true);
          await save().then(() => { window.location.href = '/x/'; });
        };
        return null;
      }`;
    expect(flags(source)).toEqual(['leaving']);
  });

  it('fails a React.useState flag and a typed one', () => {
    const source = `
      function Tool() {
        const [leaving, setLeaving] = React.useState<boolean>(false);
        const go = () => { setLeaving(true); location.assign('/x/'); };
        return null;
      }`;
    expect(flags(source)).toEqual(['leaving']);
  });
});

describe('navigating-away guard: shapes that must stay green', () => {
  it('passes the isRestoredWorkspace shape: a plain flag the navigation path never sets', () => {
    const source = `
      export default function PdfMergeTool({ navigate = (href) => { window.location.href = href; } }) {
        const [isRestoredWorkspace, setIsRestoredWorkspace] = useState(false);
        const [handoffBusy, setHandoffBusy] = useNavigatingAway();
        useEffect(() => {
          loadWorkspace().then((found) => { if (found) setIsRestoredWorkspace(true); });
        }, []);
        const performHandoff = async (tool) => {
          setHandoffBusy(true);
          await saveHandoff(tool, {});
          navigate(hrefs[tool]);
        };
        return null;
      }`;
    expect(findViolations(source, FILE)).toEqual([]);
  });

  it('passes a useNavigatingAway site', () => {
    const source = `
      export default function FileDropzone() {
        const [busy, setBusy] = useNavigatingAway();
        const openRecent = (recent) => {
          setBusy(true);
          window.location.href = toolHref(recent.tool);
        };
        return null;
      }`;
    expect(findViolations(source, FILE)).toEqual([]);
  });

  it('passes a plain flag that is only set on the failure path of a navigation', () => {
    const source = `
      function Tool() {
        const [handoffFailed, setHandoffFailed] = useState(false);
        const go = async () => {
          try { await save(); navigate('/x/'); } catch { setHandoffFailed(true); }
        };
        return null;
      }`;
    expect(findViolations(source, FILE)).toEqual([]);
  });

  it('passes a plain flag set to true in a different function than the navigation', () => {
    const source = `
      function Tool() {
        const [expanded, setExpanded] = useState(false);
        const open = () => setExpanded(true);
        const go = () => { navigate('/x/'); };
        return null;
      }`;
    expect(findViolations(source, FILE)).toEqual([]);
  });

  it('passes a navigation default that is not a component navigation', () => {
    const source = `
      function Tool({ navigate = (href) => { window.location.href = href; } }) {
        const [busy, setBusy] = useState(false);
        return null;
      }`;
    expect(findViolations(source, FILE)).toEqual([]);
  });

  it('ignores the rule quoted in a comment or a string', () => {
    const source = `
      function Tool() {
        const [busy, setBusy] = useState(false);
        // setBusy(true); window.location.href = '/x/';
        const text = "setBusy(true); location.assign('/x/')";
        return null;
      }`;
    expect(findViolations(source, FILE)).toEqual([]);
  });

  it('does not tie a flag in one component to a navigation in another', () => {
    const source = `
      function A() { const [busy, setBusy] = useState(false); const f = () => setBusy(true); return null; }
      function B() { const go = () => { navigate('/x/'); }; return null; }`;
    expect(findViolations(source, FILE)).toEqual([]);
  });
});

describe('navigating-away guard: the real tree', () => {
  it('is green with no allowlist', () => {
    expect(checkTree()).toEqual([]);
  });
});
