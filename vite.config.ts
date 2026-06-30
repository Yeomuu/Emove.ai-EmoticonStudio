import { defineConfig, loadEnv } from "vite";
import preact from "@preact/preset-vite";
import { openAIDevPlugin } from "./server/openai-dev-plugin";
import { GITHUB_PAGES_BASE } from "./src/constants";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const githubPages = mode === "github" || env.GITHUB_PAGES === "true";

  return {
    base: githubPages ? GITHUB_PAGES_BASE : "/",
    plugins: [preact(), openAIDevPlugin(env)],
    server: {
      port: 5173,
      strictPort: true,
    },
    preview: {
      port: 4173,
      strictPort: true,
    },
    worker: {
      format: "es",
    },
    build: {
      rollupOptions: {
        input: {
          index: "index.html",
        },
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (id.includes("@firebase") || id.includes("firebase/")) {
              if (id.includes("firestore")) return "firebase-firestore";
              if (id.includes("storage")) return "firebase-storage";
              if (id.includes("auth")) return "firebase-auth";
              return "firebase-core";
            }
            return undefined;
          },
        },
      },
    },
    test: {
      exclude: ["**/node_modules/**", "**/dist/**", "v2-build/**"],
    },
  };
});
