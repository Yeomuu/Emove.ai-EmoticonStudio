const TRANSPARENT_PNG_PREFIX = "data:image/png;base64,";

export async function removeChromaKeyBackground(source: string): Promise<string> {
  if (typeof document === "undefined" || !source) return source;
  const image = await decodeImage(source);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || !canvas.width || !canvas.height) return source;
  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  keyOutConnectedGreen(imageData.data, canvas.width, canvas.height);
  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

export function isProbablyTransparentPng(source: string): boolean {
  return source.startsWith(TRANSPARENT_PNG_PREFIX);
}

function decodeImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("생성 이미지를 투명 PNG로 처리하지 못했습니다."));
    image.src = source;
  });
}

function keyOutConnectedGreen(data: Uint8ClampedArray, width: number, height: number): void {
  const total = width * height;
  const visited = new Uint8Array(total);
  const queue = new Uint32Array(total);
  let head = 0;
  let tail = 0;
  const push = (index: number) => {
    if (visited[index]) return;
    visited[index] = 1;
    queue[tail] = index;
    tail += 1;
  };
  for (let x = 0; x < width; x += 1) {
    const top = x;
    const bottom = (height - 1) * width + x;
    if (isLooseChroma(data, top)) push(top);
    if (isLooseChroma(data, bottom)) push(bottom);
  }
  for (let y = 0; y < height; y += 1) {
    const left = y * width;
    const right = y * width + width - 1;
    if (isLooseChroma(data, left)) push(left);
    if (isLooseChroma(data, right)) push(right);
  }
  while (head < tail) {
    const index = queue[head];
    head += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    makeTransparent(data, index);
    if (x > 0) visitNeighbor(data, visited, queue, index - 1, tail, (nextTail) => { tail = nextTail; });
    if (x < width - 1) visitNeighbor(data, visited, queue, index + 1, tail, (nextTail) => { tail = nextTail; });
    if (y > 0) visitNeighbor(data, visited, queue, index - width, tail, (nextTail) => { tail = nextTail; });
    if (y < height - 1) visitNeighbor(data, visited, queue, index + width, tail, (nextTail) => { tail = nextTail; });
  }
  for (let index = 0; index < total; index += 1) {
    if (isStrictChroma(data, index)) makeTransparent(data, index);
    else if (hasTransparentNeighbor(data, width, height, index) && isGreenSpill(data, index)) softenGreenSpill(data, index);
  }
}

function visitNeighbor(data: Uint8ClampedArray, visited: Uint8Array, queue: Uint32Array, index: number, tail: number, setTail: (tail: number) => void): void {
  if (visited[index] || !isLooseChroma(data, index)) return;
  visited[index] = 1;
  queue[tail] = index;
  setTail(tail + 1);
}

function offset(index: number): number {
  return index * 4;
}

function isStrictChroma(data: Uint8ClampedArray, index: number): boolean {
  const cursor = offset(index);
  const r = data[cursor];
  const g = data[cursor + 1];
  const b = data[cursor + 2];
  return r < 70 && g > 185 && b < 80;
}

function isLooseChroma(data: Uint8ClampedArray, index: number): boolean {
  const cursor = offset(index);
  const r = data[cursor];
  const g = data[cursor + 1];
  const b = data[cursor + 2];
  return (g > 135 && g > r * 1.32 && g > b * 1.32) || isStrictChroma(data, index);
}

function isGreenSpill(data: Uint8ClampedArray, index: number): boolean {
  const cursor = offset(index);
  const r = data[cursor];
  const g = data[cursor + 1];
  const b = data[cursor + 2];
  return g > 95 && g > r * 1.12 && g > b * 1.12;
}

function makeTransparent(data: Uint8ClampedArray, index: number): void {
  const cursor = offset(index);
  data[cursor + 3] = 0;
}

function softenGreenSpill(data: Uint8ClampedArray, index: number): void {
  const cursor = offset(index);
  data[cursor + 1] = Math.max(data[cursor], data[cursor + 2]);
}

function hasTransparentNeighbor(data: Uint8ClampedArray, width: number, height: number, index: number): boolean {
  const x = index % width;
  const y = Math.floor(index / width);
  const candidates = [
    x > 0 ? index - 1 : -1,
    x < width - 1 ? index + 1 : -1,
    y > 0 ? index - width : -1,
    y < height - 1 ? index + width : -1,
  ];
  return candidates.some((candidate) => candidate >= 0 && data[offset(candidate) + 3] === 0);
}
