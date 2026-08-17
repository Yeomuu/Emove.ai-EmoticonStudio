import type { Metadata } from "next";
import styles from "./download.module.css";

export const metadata: Metadata = {
  title: "이모티콘 다운로드 | EMOVE",
  description: "저장한 EMOVE 이모티콘을 확인하고 다운로드합니다.",
};

type DownloadSearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function DownloadPage({ searchParams }: Readonly<{ searchParams: DownloadSearchParams }>) {
  const query = await searchParams;
  const path = singleValue(query.path);
  const title = singleValue(query.title) || "EMOVE 이모티콘";
  const format = normalizeFormat(singleValue(query.format));
  const name = singleValue(query.name) || `emove.${format.toLowerCase()}`;
  const validPath = path.startsWith("assets/") && !path.split("/").includes("..");

  if (!validPath) {
    return (
      <main className={styles.page}>
        <section className={styles.empty}>
          <span>EMOVE</span>
          <h1>미리볼 파일을 찾지 못했어요.</h1>
          <p>QR 코드를 다시 스캔하거나 보관함에서 내보내기를 다시 실행해 주세요.</p>
        </section>
      </main>
    );
  }

  const previewUrl = `/api/assets/file?path=${encodeURIComponent(path)}`;
  const downloadUrl = `/api/assets/download?path=${encodeURIComponent(path)}&name=${encodeURIComponent(name)}`;

  return (
    <main className={styles.page}>
      <section className={styles.viewer}>
        <header>
          <span>EMOVE MOBILE EXPORT</span>
          <strong>{format}</strong>
        </header>
        <div className={styles.preview}>
          <img src={previewUrl} alt={`${title} 움직이는 미리보기`} />
        </div>
        <div className={styles.copy}>
          <h1>{title}</h1>
          <p>움직임을 확인한 뒤 파일을 다운로드할까요?</p>
        </div>
        <a className={styles.download} href={downloadUrl}>투명 {format} 다운로드</a>
      </section>
    </main>
  );
}

function singleValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function normalizeFormat(value: string): "GIF" | "APNG" | "WEBP" {
  const normalized = value.toUpperCase();
  if (normalized === "APNG" || normalized === "WEBP") return normalized;
  return "GIF";
}
