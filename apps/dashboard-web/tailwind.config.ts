import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0a0a",
        panel: "#111111",
        border: "#1f1f1f",
        muted: "#8a8a8a",
        accent: "#7c5cff",
      },
    },
  },
  plugins: [],
} satisfies Config;
