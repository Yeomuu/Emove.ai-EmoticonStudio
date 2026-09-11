export function transcriptionFileName(mimeType: string): string {
  const mime = mimeType.split(";")[0].trim().toLowerCase();
  const extensions: Record<string, string> = {
    "audio/webm": "webm", "video/webm": "webm",
    "audio/mp4": "m4a", "video/mp4": "mp4", "audio/x-m4a": "m4a",
    "audio/mpeg": "mp3", "audio/mp3": "mp3",
    "audio/wav": "wav", "audio/x-wav": "wav",
  };
  const extension = extensions[mime];
  if (!extension) throw new Error("전사에 지원되지 않는 녹음 형식입니다. WebM 또는 MP4 녹음을 지원하는 브라우저에서 다시 녹음해 주세요.");
  return `emotion.${extension}`;
}
