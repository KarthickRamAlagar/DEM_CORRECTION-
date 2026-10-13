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
          950: "#08090b",
          900: "#0c0e12",
          850: "#101318",
          800: "#14171d",
          700: "#1b1f27",
          600: "#242933",
          500: "#333a47",
          400: "#4c5566",
          300: "#6b7688",
          200: "#98a2b3",
          100: "#c7ccd6",
        },
        signal: {
          teal: "#5eead4",
          gold: "#d9c48a",
          amber: "#f0b429",
          red: "#f2545b",
          green: "#4ade80",
          violet: "#a78bfa",
          sky: "#60a5fa",
          lime: "#a3e635",
          coral: "#fb7185",
        },
      },
      boxShadow: {
        panel: "0 20px 60px -20px rgba(0,0,0,0.6)",
      },
    },
  },
  plugins: [],
};
