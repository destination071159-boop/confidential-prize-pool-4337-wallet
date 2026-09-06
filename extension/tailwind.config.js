import webConfig from "./tailwind.web.config.js";

/** @type {import('tailwindcss').Config} */
export default {
  // Reuse the web app's theme (colors, fonts, animations) so the UI is identical…
  ...webConfig,
  // …but scan this standalone build's own sources (extension entry + inlined web/ + core/).
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./web/**/*.{js,ts,jsx,tsx}",
    "./core/**/*.{js,ts,jsx,tsx}",
  ],
};
