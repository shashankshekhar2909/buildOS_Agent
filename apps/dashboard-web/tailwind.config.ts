import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1600px" },
    },
    extend: {
      colors: {
        // legacy aliases kept for existing pages
        bg: "hsl(var(--bg) / <alpha-value>)",
        panel: "hsl(var(--surface) / <alpha-value>)",
        muted: "hsl(var(--text-muted) / <alpha-value>)",

        // shadcn semantic tokens (HSL CSS vars)
        background: "hsl(var(--bg) / <alpha-value>)",
        foreground: "hsl(var(--text-primary) / <alpha-value>)",
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--border) / <alpha-value>)",
        ring: "hsl(var(--accent) / <alpha-value>)",
        card: {
          DEFAULT: "hsl(var(--surface) / <alpha-value>)",
          foreground: "hsl(var(--text-primary) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--surface-elevated) / <alpha-value>)",
          foreground: "hsl(var(--text-primary) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--text-primary) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--surface) / <alpha-value>)",
          foreground: "hsl(var(--text-secondary) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--bad) / <alpha-value>)",
          foreground: "hsl(var(--text-primary) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "#7c5cff",
          hover: "#6b4ce6",
          glow: "rgba(124, 92, 255, 0.35)",
          foreground: "hsl(var(--text-primary) / <alpha-value>)",
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
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
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
        "fade-in": "fade-in 0.25s ease-out",
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { opacity: "0.6", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.05)" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
