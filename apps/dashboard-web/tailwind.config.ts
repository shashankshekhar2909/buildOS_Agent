import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#040508",
        panel: "#0b0c10",
        border: "#171a23",
        muted: "#7c8496",
        accent: {
          DEFAULT: "#7c5cff",
          hover: "#6b4ce6",
          glow: "rgba(124, 92, 255, 0.35)",
        },
        indigo: {
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
        },
        slate: {
          950: "#040508",
        },
      },
      boxShadow: {
        "glow-accent": "0 0 15px rgba(124, 92, 255, 0.25)",
        "glow-emerald": "0 0 15px rgba(16, 185, 129, 0.25)",
        "glow-sky": "0 0 15px rgba(14, 165, 233, 0.25)",
        "glow-rose": "0 0 15px rgba(244, 63, 94, 0.25)",
        "glow-amber": "0 0 15px rgba(245, 158, 11, 0.25)",
      },
      animation: {
        "pulse-glow": "pulse-glow 2s infinite ease-in-out",
        "mesh-slow": "mesh-slow 15s infinite alternate ease-in-out",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { opacity: "0.6", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.05)" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
