// Injected into the top of every tool page by the phone-check proxy (never shipped). It touches nothing in the
// page; it only watches what the tool produces and sends a copy to the dev Mac, so a person can just use the tool.
(() => {
  let sid = 'nosession';
  try { sid = sessionStorage.getItem('pc-sid') || new Date().toISOString().replace(/[:.]/g, '-'); sessionStorage.setItem('pc-sid', sid); } catch {}
  const qs = (o) => new URLSearchParams({ sid, ...o }).toString();
  const ev = (type, data) => fetch('/__check/event?' + qs({}), { method: 'POST', keepalive: true, body: JSON.stringify({ t: Date.now(), type, ...data }) }).catch(() => {});
  const seen = new WeakSet();
  const up = (blob, kind, name) => {
    if (!(blob instanceof Blob) || seen.has(blob) || blob.size < 3000 || blob.size > 60e6) return;
    seen.add(blob);
    fetch('/__check/blob?' + qs({ kind, type: blob.type, name: name || '' }), { method: 'POST', body: blob }).catch(() => {});
  };
  ev('load', { url: location.pathname, ua: navigator.userAgent, screen: [screen.width, screen.height, devicePixelRatio], secure: isSecureContext });

  const create = URL.createObjectURL;
  URL.createObjectURL = function (o) { if (o instanceof Blob && /^(image\/|application\/pdf)/.test(o.type)) up(o, 'blob'); return create.apply(this, arguments); };
  document.addEventListener('change', (e) => {
    const i = e.target;
    if (i instanceof HTMLInputElement && i.type === 'file') [...(i.files || [])].forEach((f) => up(f, 'input', f.name));
  }, true);
  if (window.ImageCapture) {
    const take = ImageCapture.prototype.takePhoto;
    ImageCapture.prototype.takePhoto = async function () {
      const t0 = performance.now(); const b = await take.apply(this, arguments);
      ev('takePhoto', { ms: Math.round(performance.now() - t0), size: b.size }); up(b, 'takephoto'); return b;
    };
  }
  if (navigator.share) {
    const share = navigator.share;
    navigator.share = function (d) { (d?.files || []).forEach((f) => up(f, 'share', f.name)); ev('share', { files: (d?.files || []).map((f) => [f.name, f.size]) }); return share.call(this, d); };
  }
  const md = navigator.mediaDevices;
  if (md?.getUserMedia) {
    const gum = md.getUserMedia.bind(md);
    md.getUserMedia = async (c) => {
      const s = await gum(c); const t = s.getVideoTracks()[0];
      if (t) ev('stream', { settings: t.getSettings(), zoom: t.getCapabilities?.().zoom || null });
      return s;
    };
  }
  addEventListener('error', (e) => ev('error', { msg: String(e.message), at: e.filename + ':' + e.lineno }));
  addEventListener('unhandledrejection', (e) => ev('rejection', { msg: String(e.reason && (e.reason.message || e.reason)) }));

  // What the page worker computed for each photo (the turn and whether it is a guess), read off its replies.
  const Native = window.Worker;
  if (Native) {
    window.Worker = class extends Native {
      constructor(...a) {
        super(...a);
        this.addEventListener('message', (m) => {
          const d = m.data && (m.data.result || m.data.value || m.data);
          if (d && typeof d === 'object' && 'turns' in d && 'width' in d) ev('inspected', { turns: d.turns, turnUnsure: d.turnUnsure, w: d.width, h: d.height, quad: d.quad ? d.quad.map((p) => [+p.x.toFixed(3), +p.y.toFixed(3)]) : null });
        });
      }
    };
  }
  let askShown = false;
  setInterval(() => {
    const now = !!document.querySelector('[data-turn-ask]');
    if (now !== askShown) { askShown = now; ev('turnAsk', { shown: now, viewerOpen: !!document.querySelector('[data-page-viewer][open]') }); }
  }, 150);

  // A small readout so the person can see it is listening; hint changes go to the timeline.
  const pill = document.createElement('div');
  pill.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:2147483647;background:#000c;color:#0f0;font:11px/1.3 monospace;padding:3px 6px;border-radius:6px;pointer-events:none';
  addEventListener('DOMContentLoaded', () => document.documentElement.append(pill));
  let last = null;
  setInterval(() => {
    const el = document.querySelector('[data-camera-hint]');
    const code = el ? (el.getAttribute('data-camera-hint') || 'none') + (el.querySelector('[data-advice]') ? '*' : '') : null;
    if (code !== last) { if (code || last) ev('hint', { code }); last = code; }
    pill.textContent = code ? 'hint: ' + code : '';
  }, 150);
})();
