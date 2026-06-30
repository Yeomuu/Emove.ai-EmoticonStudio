import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const dist = resolve("dist");
const index = resolve(dist, "index.html");
const fallback = resolve(dist, "404.html");

if (!existsSync(index)) {
  throw new Error("dist/index.html was not found. Run the Vite build first.");
}

copyFileSync(index, fallback);
