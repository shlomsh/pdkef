// SCAN-08: a camera for Chromium to fake (--use-file-for-fake-video-capture), drawn here instead of kept
// as a binary: a lighter page turned a few degrees on a dark desk, with dark lines of "text" so the page
// reads as sharp. Y4M, 4:2:0, a few identical frames that Chromium loops.
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const W = 640;
const H = 480;

function pageLuma() {
  const y = new Uint8Array(W * H);
  const angle = (5 * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  // The page: 300 x 400 px around the centre, in its own turned frame.
  const halfW = 150;
  const halfH = 200;
  for (let row = 0; row < H; row += 1) {
    for (let col = 0; col < W; col += 1) {
      const dx = col - W / 2;
      const dy = row - H / 2;
      const u = dx * cos + dy * sin;
      const v = -dx * sin + dy * cos;
      // A little fixed grain, so the desk is not a flat fill.
      const grain = ((row * 31 + col * 17) % 7) - 3;
      let value = 40 + grain;
      if (Math.abs(u) < halfW && Math.abs(v) < halfH) {
        value = 225 + grain;
        const line = Math.floor((v + halfH - 40) / 22);
        const inLine = (v + halfH - 40) % 22 < 7;
        const lineEnd = halfW - 30 - (line % 3) * 40;
        if (v > -halfH + 40 && v < halfH - 40 && inLine && u > -halfW + 30 && u < lineEnd) value = 50;
      }
      y[row * W + col] = value;
    }
  }
  return y;
}

/** Writes the Y4M to a fresh temp folder and returns its path. */
export function writeFakeCamera(frames = 3) {
  const header = Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`);
  const chroma = Buffer.alloc((W / 2) * (H / 2) * 2, 128);
  const luma = Buffer.from(pageLuma());
  const parts = [header];
  for (let i = 0; i < frames; i += 1) parts.push(Buffer.from('FRAME\n'), luma, chroma);
  const path = join(mkdtempSync(join(tmpdir(), 'scan-camera-')), 'page.y4m');
  writeFileSync(path, Buffer.concat(parts));
  return path;
}
