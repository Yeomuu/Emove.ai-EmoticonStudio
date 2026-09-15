export const CAMERA_FRAME_WIDTH = 960;
export const CAMERA_FRAME_HEIGHT = 720;

// Match the live preview's centered object-fit: cover without stretching pixels.
export function cameraFrameCrop(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("Camera frame dimensions must be positive.");
  }
  const ratio = CAMERA_FRAME_WIDTH / CAMERA_FRAME_HEIGHT;
  const cropWidth = Math.min(width, height * ratio);
  const cropHeight = Math.min(height, width / ratio);
  return { x: (width - cropWidth) / 2, y: (height - cropHeight) / 2, width: cropWidth, height: cropHeight };
}
