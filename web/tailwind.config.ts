import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        raised: "rgb(var(--raised) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        mute: "rgb(var(--mute) / <alpha-value>)",
        brand: "rgb(var(--brand) / <alpha-value>)",
        amber: "rgb(var(--amber) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
        sky: "rgb(var(--sky) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-fraunces)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgb(var(--brand) / 0.35), 0 8px 40px -8px rgb(var(--brand) / 0.35)",
        card: "0 1px 0 0 rgb(255 255 255 / 0.04) inset, 0 12px 32px -16px rgb(0 0 0 / 0.6)",
      },
      keyframes: {
        rise: { from: { opacity: "0", transform: "translateY(10px)" }, to: { opacity: "1", transform: "none" } },
        shake: {
          "0%,100%": { transform: "translateX(0)" },
          "20%,60%": { transform: "translateX(-6px)" },
          "40%,80%": { transform: "translateX(6px)" },
        },
        pulseRing: {
          "0%": { boxShadow: "0 0 0 0 rgb(var(--brand) / 0.5)" },
          "100%": { boxShadow: "0 0 0 14px rgb(var(--brand) / 0)" },
        },
        blink: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.35" } },
      },
      animation: {
        rise: "rise .6s cubic-bezier(.2,.7,.2,1) both",
        shake: "shake .45s ease-in-out",
        pulseRing: "pulseRing 1.8s ease-out infinite",
        blink: "blink 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
