const OPENAI_REFERENCE_MAX_SIDE = 512;
const OPENAI_REFERENCE_TARGET_BYTES = 1_200_000;

export async function prepareTransparentGeneratedImage(source: string): Promise<string> {
  if (typeof document === "undefined") throw new Error("투명 이미지 검증은 브라우저에서 실행해야 합니다.");
  const image = await decodeImage(source);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || !canvas.width || !canvas.height) throw new Error("생성 이미지 크기 또는 캔버스를 확인하지 못했습니다.");
  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  assertTransparentCharacterPixels(imageData.data);
  return canvas.toDataURL("image/png");
}

export function normalizeGeneratedImageSource(source: string, currentHref: string): string {
  if (!source || source.startsWith("data:") || source.startsWith("blob:")) return source;
  try {
    const current = new URL(currentHref);
    const candidate = new URL(source, current);
    if (candidate.origin !== current.origin && candidate.pathname === "/api/assets/file") {
      return `${candidate.pathname}${candidate.search}${candidate.hash}`;
    }
  } catch {
    return source;
  }
  return source;
}

export async function compactReferenceImageForOpenAI(source: string): Promise<string> {
  if (typeof document === "undefined" || !source) return source;
  try {
    const image = await decodeImage(source);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) return source;
    const scale = Math.min(1, OPENAI_REFERENCE_MAX_SIDE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) return source;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = canvas.toDataURL("image/png");
    if (dataUrlBytes(png) <= OPENAI_REFERENCE_TARGET_BYTES) return png;
    return canvas.toDataURL("image/webp", .82);
  } catch {
    throw new Error("캐릭터 참조 이미지를 준비하지 못했습니다. 이미지를 다시 선택하거나 업로드해 주세요.");
  }
}

export async function compactReferenceImagesForOpenAI(sources: string[]): Promise<string[]> {
  const compacted: string[] = [];
  for (const source of sources) {
    const next = await compactReferenceImageForOpenAI(source);
    if (next) compacted.push(next);
  }
  return compacted;
}

function decodeImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("생성 이미지를 불러오지 못했습니다."));
    image.src = normalizeGeneratedImageSource(source, window.location.href);
  });
}

function dataUrlBytes(value: string): number {
  return new Blob([value]).size;
}

// Check native alpha without removing colors or altering generated pixels.
export function assertTransparentCharacterPixels(pixels: Uint8ClampedArray): void {
  let transparent = false;
  let visible = false;
  for (let index = 3; index < pixels.length; index += 4) {
    transparent ||= pixels[index] === 0;
    visible ||= pixels[index] > 0;
    if (transparent && visible) return;
  }
  throw new Error(visible
    ? "생성 이미지에 실제 투명 배경이 없습니다. 배경 제거 없이 사용할 수 있도록 다시 생성해 주세요."
    : "생성 이미지가 완전히 비어 있습니다. 다시 생성해 주세요.");
}
