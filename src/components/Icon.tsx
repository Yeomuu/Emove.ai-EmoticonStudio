import type { ImgHTMLAttributes } from "react";
import addIcon from "../assets/icons/add-plus.svg";
import reloadIcon from "../assets/icons/arrows-reload-01.svg";
import cameraIcon from "../assets/icons/camera.svg";
import checkIcon from "../assets/icons/check.svg";
import previousIcon from "../assets/icons/chevron-left.svg";
import nextIcon from "../assets/icons/chevron-right.svg";
import closeIcon from "../assets/icons/close-md.svg";
import downloadIcon from "../assets/icons/download.svg";
import dragIcon from "../assets/icons/drag-vertical.svg";
import editIcon from "../assets/icons/edit-pencil-line-01.svg";
import folderIcon from "../assets/icons/folder.svg";
import imageIcon from "../assets/icons/image-02.svg";
import layersIcon from "../assets/icons/layers.svg";
import unlockIcon from "../assets/icons/lock-open.svg";
import lockIcon from "../assets/icons/lock.svg";
import moonIcon from "../assets/icons/moon.svg";
import pauseIcon from "../assets/icons/pause.svg";
import playIcon from "../assets/icons/play.svg";
import saveIcon from "../assets/icons/save.svg";
import searchIcon from "../assets/icons/search-magnifying-glass.svg";
import settingsIcon from "../assets/icons/settings.svg";
import starIcon from "../assets/icons/star.svg";
import sunIcon from "../assets/icons/sun.svg";
import trashIcon from "../assets/icons/trash-full.svg";
import undoIcon from "../assets/icons/undo.svg";
import voiceIcon from "../assets/icons/user-voice.svg";
import volumeIcon from "../assets/icons/volume-max.svg";

type AssetSource = string | { src: string };

const iconSources = {
  add: addIcon,
  camera: cameraIcon,
  check: checkIcon,
  close: closeIcon,
  download: downloadIcon,
  drag: dragIcon,
  edit: editIcon,
  folder: folderIcon,
  image: imageIcon,
  layers: layersIcon,
  lock: lockIcon,
  moon: moonIcon,
  unlock: unlockIcon,
  pause: pauseIcon,
  play: playIcon,
  reload: reloadIcon,
  save: saveIcon,
  search: searchIcon,
  settings: settingsIcon,
  star: starIcon,
  sun: sunIcon,
  trash: trashIcon,
  undo: undoIcon,
  voice: voiceIcon,
  volume: volumeIcon,
  previous: previousIcon,
  next: nextIcon,
} as const;

export type IconName = keyof typeof iconSources;

export function Icon({ name, size = 18, className = "", ...props }: { name: IconName; size?: number; className?: string } & Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "width" | "height">) {
  const source = iconSources[name] as AssetSource;
  const src = typeof source === "string" ? source : source.src;
  return <img className={`icon ${className}`} src={src} alt="" aria-hidden="true" width={size} height={size} {...props} />;
}
