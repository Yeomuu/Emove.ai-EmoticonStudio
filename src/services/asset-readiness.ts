export async function waitForImageAssets(urls: string[]): Promise<void> {
  const uniqueUrls = [...new Set(urls.filter(Boolean))];
  await Promise.all(uniqueUrls.map(waitForImageAsset));
}

function waitForImageAsset(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("생성된 이미지를 화면에 불러오지 못했습니다."));
    image.src = url;

    if (image.complete && image.naturalWidth > 0) {
      resolve();
    }
  });
}
