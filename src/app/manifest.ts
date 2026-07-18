import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EMOVE Emoticon Studio",
    short_name: "EMOVE",
    description: "캐릭터와 움직이는 이모티콘을 제작하는 스튜디오",
    start_url: "/home",
    display: "standalone",
    background_color: "#070711",
    theme_color: "#070711",
    orientation: "any",
    icons: [
      { src: "/favicon.png", sizes: "any", type: "image/png" },
    ],
  };
}
