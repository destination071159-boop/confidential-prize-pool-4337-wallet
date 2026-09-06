/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // c7984 yellow/gold accent ramp (light theme)
        zama: {
          50:  "#fffbea",
          100: "#fff3c4",
          200: "#fce588",
          300: "#fadb5f",
          400: "#d9a400",
          500: "#b8860b",
          600: "#a97e00",
          700: "#8a6d00",
          800: "#6b5500",
          900: "#4a3b00",
          950: "#2e2400",
        },
        yellowbrand: "#f9d100",
      },
      fontFamily: {
        sans: ["Telegraf", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.3s ease-in-out",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
