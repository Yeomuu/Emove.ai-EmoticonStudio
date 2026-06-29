import type { JSX } from "preact";

const iconFiles = {
  add: "add-plus.svg",
  camera: "camera.svg",
  check: "check.svg",
  close: "close-md.svg",
  download: "download.svg",
  drag: "drag-vertical.svg",
  edit: "edit-pencil-line-01.svg",
  folder: "folder.svg",
  image: "image-02.svg",
  layers: "layers.svg",
  lock: "lock.svg",
  unlock: "lock-open.svg",
  pause: "pause.svg",
  play: "play.svg",
  reload: "arrows-reload-01.svg",
  save: "save.svg",
  search: "search-magnifying-glass.svg",
  settings: "settings.svg",
  star: "star.svg",
  trash: "trash-full.svg",
  undo: "undo.svg",
  voice: "user-voice.svg",
  volume: "volume-max.svg",
  previous: "chevron-left.svg",
  next: "chevron-right.svg",
} as const;

export type IconName = keyof typeof iconFiles;

export function Icon({ name, size = 18, class: className = "", ...props }: { name: IconName; size?: number; class?: string } & Omit<JSX.HTMLAttributes<HTMLImageElement>, "src" | "width" | "height">) {
  const src = new URL(`../assets/icons/${iconFiles[name]}`, import.meta.url).href;
  return <img class={`icon ${className}`} src={src} alt="" aria-hidden="true" width={size} height={size} {...props} />;
}
