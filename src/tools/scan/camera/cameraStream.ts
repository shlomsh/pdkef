// The camera stream and the full-sensor photo (SCAN-08). DOM; jsdom has no camera, so no unit test.

interface ImageCaptureLike { takePhoto(): Promise<Blob> }
declare const ImageCapture: { new (track: MediaStreamTrack): ImageCaptureLike };

export function openCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new TypeError('navigator.mediaDevices is not available');
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
  });
}

/** The full-sensor photo, whatever the stream size. The track's resolution stays low: raising it slows the frame grab. */
export function takePhoto(track: MediaStreamTrack): Promise<Blob> {
  return new ImageCapture(track).takePhoto();
}

export function stopCamera(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}
