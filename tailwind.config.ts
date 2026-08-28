import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        space: {
          50: "#f0f4ff",
          100: "#dce6ff",
          200: "#b9cdff",
          300: "#85a8ff",
          400: "#4d7bff",
          500: "#1a4fff",
          600: "#0030f0",
          700: "#0024c4",
          800: "#001e9e",
          900: "#00187c",
          950: "#000e4a",
        },
        navy: {
          50: "#f0f3fa",
          100: "#dde4f5",
          200: "#c0ceee",
          300: "#94afe4",
          400: "#638ad6",
          500: "#3f6ac8",
          600: "#2e52b8",
          700: "#273fa1",
          800: "#253484",
          900: "#232d6b",
          950: "#0d1224",
        },
        surface: {
          primary: "#080d1a",
          secondary: "#0d1528",
          tertiary: "#111d35",
          card: "#0f1a2e",
          border: "#1e2d4a",
          "border-light": "#2a3d5e",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "Consolas", "monospace"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.3s ease-in-out",
        "slide-up": "slideUp 0.3s ease-out",
        blink: "blink 1.2s step-end infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
