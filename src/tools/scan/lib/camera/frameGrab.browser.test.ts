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

const unloadedVideo = () => document.createElement('video');

describe('grabGray', () => {
  it('returns null while the video has no size', () => {
    const drawImage = vi.spyOn(CanvasRenderingContext2D.prototype, 'drawImage');
    const canvas = document.createElement('canvas');
    expect(grabGray(unloadedVideo(), canvas)).toBeNull();
    expect(drawImage).not.toHaveBeenCalled();
    expect(canvas.width).toBe(300);
    expect(canvas.height).toBe(150);
  });

  it('scales so the short edge is 320', async () => {
    const canvas = document.createElement('canvas');
    const got = grabGray(await liveVideo(1920, 1080, solid(128, 128, 128)), canvas)!;
    expect(got.width).toBe(569);
    expect(got.height).toBe(320);
    expect(got.data.length).toBe(569 * 320);
    expect(canvas.width).toBe(569);
    expect(canvas.height).toBe(320);
  });

  it('converts RGBA to gray with the 0.299/0.587/0.114 weights', async () => {
    const video = await liveVideo(640, 320, solid(200, 100, 50));
    const [r, g, b] = decodedColour(video);
    expect(Math.abs(r - 200)).toBeLessThanOrEqual(VIDEO_TOLERANCE);
    expect(Math.abs(g - 100)).toBeLessThanOrEqual(VIDEO_TOLERANCE);
    expect(Math.abs(b - 50)).toBeLessThanOrEqual(VIDEO_TOLERANCE);
    const got = grabGray(video, document.createElement('canvas'), 32)!;
    expect(got.data[0]).toBe(grayOf(r, g, b));
    expect(got.data[got.data.length - 1]).toBe(grayOf(r, g, b));
  });
});

describe('grabGray with a view', () => {
  it('draws only that share of the frame, with the short edge of the share at 320', async () => {
    const video = await liveVideo(640, 480, whiteRect(160, 0, 320, 480));
    const drawImage = vi.spyOn(CanvasRenderingContext2D.prototype, 'drawImage');
    const got = grabGray(video, document.createElement('canvas'), 320, { x: 0.25, y: 0, width: 0.5, height: 1 })!;
    expect(drawImage).toHaveBeenCalledWith(video, 160, 0, 320, 480, 0, 0, got.width, got.height);
    expect(got.width).toBe(320);
    expect(got.height).toBe(480);
    expect(column(got, 2)).toBeGreaterThan(WHITE);
    expect(column(got, 160)).toBeGreaterThan(WHITE);
    expect(column(got, 317)).toBeGreaterThan(WHITE);
  });
});

describe('frameGrabber view', () => {
  it('crops to what object-fit: cover shows and returns that share', async () => {
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

describe('grabFocusPatch', () => {
  it('returns null while the video has no size', () => {
    expect(grabFocusPatch(unloadedVideo(), document.createElement('canvas'))).toBeNull();
  });

  it('takes a 256px square from the centre at the video resolution', async () => {
    const video = await liveVideo(1920, 1080, whiteRect((1920 - 256) / 2, (1080 - 256) / 2, 256, 256));
    const drawImage = vi.spyOn(CanvasRenderingContext2D.prototype, 'drawImage');
    const got = grabFocusPatch(video, document.createElement('canvas'))!;
    expect(got.width).toBe(256);
    expect(got.height).toBe(256);
    expect(drawImage).toHaveBeenCalledWith(video, (1920 - 256) / 2, (1080 - 256) / 2, 256, 256, 0, 0, 256, 256);
    for (const edge of [column(got, 1), column(got, 254), row(got, 1), row(got, 254), column(got, 128)]) expect(edge).toBeGreaterThan(WHITE);
  });

  // SCAN-16: a fixed 256px of a full-size stream is a sliver of the page, often blank paper.
  it('covers the same share of a full-size video, scaled down to 256px', async () => {
    const side = Math.round((3024 * 256) / 1080);
    const left = Math.floor((3024 - side) / 2);
    const top = Math.floor((4032 - side) / 2);
    const cornerMarked: Paint = (ctx, width, height) => {
      whiteRect(left, top, side, side)(ctx, width, height);
      ctx.fillStyle = '#000';
      ctx.fillRect(left, top, 120, 120);
    };
    const video = await liveVideo(3024, 4032, cornerMarked);
    const drawImage = vi.spyOn(CanvasRenderingContext2D.prototype, 'drawImage');
    const got = grabFocusPatch(video, document.createElement('canvas'))!;
    expect(drawImage).toHaveBeenCalledWith(video, Math.floor((3024 - side) / 2), Math.floor((4032 - side) / 2), side, side, 0, 0, 256, 256);
    expect(got.width).toBe(256);
    expect(got.height).toBe(256);
    expect(got.data[6 * 256 + 6]).toBeLessThan(VIDEO_TOLERANCE);
    for (const edge of [column(got, 254), row(got, 254), column(got, 128), row(got, 128)]) expect(edge).toBeGreaterThan(WHITE);
  });

  it('clamps the square to a small video', async () => {
    const got = grabFocusPatch(await liveVideo(200, 120, solid(128, 128, 128)), document.createElement('canvas'))!;
    expect(got.width).toBe(120);
    expect(got.height).toBe(120);
  });

  it('converts RGBA to gray like grabGray', async () => {
    const video = await liveVideo(640, 480, solid(200, 100, 50));
    const [r, g, b] = decodedColour(video);
    expect(grabFocusPatch(video, document.createElement('canvas'))!.data[0]).toBe(grayOf(r, g, b));
  });
});

describe('frameGrabber', () => {
  it('gives nothing while the video has no size', () => {
    expect(frameGrabber()(unloadedVideo(), 5)).toBeNull();
  });

  it('packs the frame and the focus crop into one message, both buffers transferred', async () => {
    const video = await liveVideo(1920, 1080, solid(128, 128, 128), { width: 960, height: 540 });
    const { message, transfer } = frameGrabber()(video, 5)!;
    expect(message).toMatchObject({ t: 5, width: 569, height: 320, patch: { width: 256, height: 256 } });
    expect(message.buffer.byteLength).toBe(569 * 320);
    expect(message.patch!.buffer.byteLength).toBe(256 * 256);
    expect(transfer).toEqual([message.buffer, message.patch!.buffer]);
    expect(transfer[0]).not.toBe(transfer[1]);
  });
});

describe('snapshot', () => {
  it('draws the frame scaled to the long edge and encodes a JPEG', async () => {
    const video = await liveVideo(1920, 1080, whiteRect(0, 0, 960, 1080));
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob');
    const blob = await snapshot(video, 480);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.8);
    expect(blob.type).toBe('image/jpeg');
    const decoded = await createImageBitmap(blob);
    expect(decoded.width).toBe(480);
    expect(decoded.height).toBe(270);
    const probe = document.createElement('canvas');
    probe.width = 480;
    probe.height = 270;
    const ctx = probe.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(decoded, 0, 0);
    expect(ctx.getImageData(60, 135, 1, 1).data[0]).toBeGreaterThan(WHITE);
    expect(ctx.getImageData(420, 135, 1, 1).data[0]).toBeLessThan(VIDEO_TOLERANCE);
  });
});
