/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
      colors: {
        ink: {
          950: "rgb(var(--ink-950) / <alpha-value>)",
          900: "rgb(var(--ink-900) / <alpha-value>)",
          850: "rgb(var(--ink-850) / <alpha-value>)",
          800: "rgb(var(--ink-800) / <alpha-value>)",
          700: "rgb(var(--ink-700) / <alpha-value>)",
          600: "rgb(var(--ink-600) / <alpha-value>)",
          500: "rgb(var(--ink-500) / <alpha-value>)",
          400: "rgb(var(--ink-400) / <alpha-value>)",
          300: "rgb(var(--ink-300) / <alpha-value>)",
          200: "rgb(var(--ink-200) / <alpha-value>)",
          100: "rgb(var(--ink-100) / <alpha-value>)",
        },
        signal: {
          teal: "rgb(var(--signal-teal) / <alpha-value>)",
          gold: "rgb(var(--signal-gold) / <alpha-value>)",
          amber: "rgb(var(--signal-amber) / <alpha-value>)",
          red: "rgb(var(--signal-red) / <alpha-value>)",
          green: "rgb(var(--signal-green) / <alpha-value>)",
          violet: "rgb(var(--signal-violet) / <alpha-value>)",
          sky: "rgb(var(--signal-sky) / <alpha-value>)",
          lime: "rgb(var(--signal-lime) / <alpha-value>)",
          coral: "rgb(var(--signal-coral) / <alpha-value>)",
        },
      },
      boxShadow: {
        panel: "0 20px 60px -20px rgba(0,0,0,0.6)",
      },
    },
  },
  plugins: [],
};
