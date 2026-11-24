import { afterEach, describe, expect, it, vi } from 'vitest';
import { frameGrabber, grabFocusPatch, grabGray, snapshot } from './frameGrab.ts';

const VIDEO_TOLERANCE = 6;

const opened: { video: HTMLVideoElement; stream: MediaStream }[] = [];

afterEach(() => {
  for (const { video, stream } of opened.splice(0)) {
    stream.getTracks().forEach((track) => track.stop());
    video.remove();
  }
  vi.restoreAllMocks();
});

type Paint = (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
type Gray = { width: number; height: number; data: Uint8ClampedArray };

async function liveVideo(width: number, height: number, paint: Paint, box?: { width: number; height: number }) {
  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  paint(source.getContext('2d')!, width, height);
  const stream = source.captureStream(0);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  const size = box ?? { width: Math.min(width, 320), height: Math.min(height, 320) };
  video.style.width = `${size.width}px`;
  video.style.height = `${size.height}px`;
  document.body.append(video);
  opened.push({ video, stream });
  video.srcObject = stream;
  const frame = new Promise<void>((done) => video.requestVideoFrameCallback(() => done()));
  await video.play();
  (stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack).requestFrame();
  await frame;
  return video;
}

const solid =
  (r: number, g: number, b: number) =>
  ((ctx, w, h) => {
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, w, h);
  }) satisfies Paint;

const whiteRect =
  (x: number, y: number, w: number, h: number) =>
  ((ctx, width, height) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, w, h);
  }) satisfies Paint;

const column = (gray: Gray, x: number) => {
  let sum = 0;
  for (let y = 0; y < gray.height; y++) sum += gray.data[y * gray.width + x];
  return sum / gray.height;
};
const row = (gray: Gray, y: number) => {
  let sum = 0;
  for (let x = 0; x < gray.width; x++) sum += gray.data[y * gray.width + x];
  return sum / gray.width;
};
const WHITE = 255 - VIDEO_TOLERANCE;

const grayOf = (r: number, g: number, b: number) => Math.floor(0.299 * r + 0.587 * g + 0.114 * b);

function decodedColour(video: HTMLVideoElement) {
  const probe = document.createElement('canvas');
  probe.width = 4;
  probe.height = 4;
  const ctx = probe.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(video, 0, 0, 4, 4);
  const { data } = ctx.getImageData(2, 2, 1, 1);
  return [data[0], data[1], data[2]];
}

describe('grabGray and frameGrabber on a live video', () => {
  it('resizes the canvas to the scaled short edge, draws only the share of the frame it was given, and crops to what object-fit: cover shows', async () => {
    const canvas = document.createElement('canvas');
    grabGray(await liveVideo(1920, 1080, solid(128, 128, 128)), canvas);
    expect([canvas.width, canvas.height], 'canvas after a short edge of 320').toEqual([569, 320]);

    const shared = await liveVideo(640, 480, whiteRect(160, 0, 320, 480));
    const sharedDraw = vi.spyOn(CanvasRenderingContext2D.prototype, 'drawImage');
    const got = grabGray(shared, document.createElement('canvas'), 320, { x: 0.25, y: 0, width: 0.5, height: 1 })!;
    expect(sharedDraw).toHaveBeenCalledWith(shared, 160, 0, 320, 480, 0, 0, got.width, got.height);
    expect(got.width).toBe(320);
    expect(got.height).toBe(480);
    expect(column(got, 2)).toBeGreaterThan(WHITE);
    expect(column(got, 160)).toBeGreaterThan(WHITE);
    expect(column(got, 317)).toBeGreaterThan(WHITE);
    sharedDraw.mockRestore();

    const ramp: Paint = (ctx, w, h) => {
      const gradient = ctx.createLinearGradient(0, 0, w, 0);
      gradient.addColorStop(0, '#000');
      gradient.addColorStop(1, '#fff');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
    };
    const video = await liveVideo(640, 480, ramp, { width: 390, height: 844 });
    const drawImage = vi.spyOn(CanvasRenderingContext2D.prototype, 'drawImage');
    const grabbed = frameGrabber()(video, 0)!;
    expect(drawImage.mock.calls.find((call) => call[0] === video)![1]).toBeCloseTo(grabbed.view.x * 640);
    expect(video.clientWidth).toBe(390);
    expect(video.clientHeight).toBe(844);
    expect(grabbed.view.width).toBeCloseTo(390 / 844 / (640 / 480));
    expect(grabbed.view.height).toBe(1);
    const frame = new Uint8ClampedArray(grabbed.message.buffer);
    const level = (x: number) => (x / 640) * 255;
    expect(Math.abs(frame[0] - level(grabbed.view.x * 640))).toBeLessThanOrEqual(VIDEO_TOLERANCE);
    expect(Math.abs(frame[grabbed.message.width - 1] - level((grabbed.view.x + grabbed.view.width) * 640))).toBeLessThanOrEqual(VIDEO_TOLERANCE);
  });
});

describe('the focus patch and the snapshot on a live video', () => {
  // SCAN-16: a fixed 256px of a full-size stream is a sliver of the page, often blank paper.
  it('takes a 256px square from the centre at the video resolution, frameGrabber packs it with both buffers transferred, it covers the same share of a full-size video scaled down to 256px, and snapshot draws the frame scaled to the long edge as a JPEG', async () => {
    const video = await liveVideo(1920, 1080, whiteRect((1920 - 256) / 2, (1080 - 256) / 2, 256, 256));
    const drawImage = vi.spyOn(CanvasRenderingContext2D.prototype, 'drawImage');
    const got = grabFocusPatch(video, document.createElement('canvas'))!;
    expect(got.width, 'centre patch width').toBe(256);
    expect(got.height, 'centre patch height').toBe(256);
    expect(drawImage, 'centre patch draw').toHaveBeenCalledWith(video, (1920 - 256) / 2, (1080 - 256) / 2, 256, 256, 0, 0, 256, 256);
    for (const edge of [column(got, 1), column(got, 254), row(got, 1), row(got, 254), column(got, 128)]) expect(edge, 'centre patch edges').toBeGreaterThan(WHITE);
    const { message, transfer } = frameGrabber()(video, 5)!;
    const wide = await liveVideo(1920, 1080, solid(128, 128, 128), { width: 960, height: 540 });
    const packed = frameGrabber()(wide, 5)!;
    expect(packed.message, 'the frame message').toMatchObject({ t: 5, width: 569, height: 320 });
    expect(packed.message.buffer.byteLength, 'frame bytes').toBe(569 * 320);
    expect(message.patch, 'the focus patch in the message').toMatchObject({ width: 256, height: 256 });
    expect(message.patch!.buffer.byteLength, 'patch bytes').toBe(256 * 256);
    expect(transfer, 'both buffers transferred').toEqual([message.buffer, message.patch!.buffer]);
    expect(transfer[0], 'distinct buffers').not.toBe(transfer[1]);
    drawImage.mockRestore();

    const coloured = await liveVideo(640, 480, solid(200, 100, 50));
    const [r, g, b] = decodedColour(coloured);
    expect(grabFocusPatch(coloured, document.createElement('canvas'))!.data[0], 'patch gray weights').toBe(grayOf(r, g, b));
    expect(grabGray(coloured, document.createElement('canvas'), 32)!.data[0], 'frame gray weights').toBe(grayOf(r, g, b));
    const small = grabFocusPatch(await liveVideo(200, 120, solid(128, 128, 128)), document.createElement('canvas'))!;
    expect([small.width, small.height], 'clamped to a small video').toEqual([120, 120]);

    const side = Math.round((3024 * 256) / 1080);
    const left = Math.floor((3024 - side) / 2);
    const top = Math.floor((4032 - side) / 2);
    const cornerMarked: Paint = (ctx, width, height) => {
      whiteRect(left, top, side, side)(ctx, width, height);
      ctx.fillStyle = '#000';
      ctx.fillRect(left, top, 120, 120);
    };
    const full = await liveVideo(3024, 4032, cornerMarked);
    const drawFull = vi.spyOn(CanvasRenderingContext2D.prototype, 'drawImage');
    const fullPatch = grabFocusPatch(full, document.createElement('canvas'))!;
    expect(drawFull, 'full-size draw').toHaveBeenCalledWith(full, Math.floor((3024 - side) / 2), Math.floor((4032 - side) / 2), side, side, 0, 0, 256, 256);
    expect(fullPatch.width, 'full-size patch width').toBe(256);
    expect(fullPatch.height, 'full-size patch height').toBe(256);
    expect(fullPatch.data[6 * 256 + 6], 'full-size corner').toBeLessThan(VIDEO_TOLERANCE);
    for (const edge of [column(fullPatch, 254), row(fullPatch, 254), column(fullPatch, 128), row(fullPatch, 128)]) expect(edge, 'full-size patch edges').toBeGreaterThan(WHITE);
    drawFull.mockRestore();

    const halfWhite = await liveVideo(1920, 1080, whiteRect(0, 0, 960, 1080));
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob');
    const blob = await snapshot(halfWhite, 480);
    expect(toBlob, 'snapshot encode').toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.8);
    expect(blob.type, 'snapshot type').toBe('image/jpeg');
    const decoded = await createImageBitmap(blob);
    expect(decoded.width, 'snapshot width').toBe(480);
    expect(decoded.height, 'snapshot height').toBe(270);
    const probe = document.createElement('canvas');
    probe.width = 480;
    probe.height = 270;
    const ctx = probe.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(decoded, 0, 0);
    expect(ctx.getImageData(60, 135, 1, 1).data[0], 'snapshot white half').toBeGreaterThan(WHITE);
    expect(ctx.getImageData(420, 135, 1, 1).data[0], 'snapshot dark half').toBeLessThan(VIDEO_TOLERANCE);
  });
});
