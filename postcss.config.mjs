import path from "node:path";
const config = {
  plugins: {
    "postcss-import": {},
    tailwindcss: {},
    [path.resolve("scripts/postcss-sierra.cjs")]: {},
    autoprefixer: {},
  },
};

export default config;
