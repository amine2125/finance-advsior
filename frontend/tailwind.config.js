/** @type {import('tailwindcss').Config} */
// Restrained, Wealthsimple-like system: white / light grey, near-black ink, one gold accent for the main action,
// green / red only for gains and losses.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Instrument Sans'", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        display: ["Jost", "'Futura PT'", "Futura", "'Century Gothic'", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        ink: { DEFAULT: "#1a1a19", soft: "#5c5b57", muted: "#8e8c86" },
        canvas: "#f6f5f2",
        line: "#ebe9e4",
        gold: { 50: "#fdf6e7", 100: "#fbe9c2", 400: "#f6c25a", 500: "#f2b23e", 600: "#d9971f" },
        // legacy names still used by some components
        brand: { 50: "#f3f3f0", 100: "#e9e8e3", 200: "#d6d4cd", 300: "#a3a19a", 500: "#2563c9", 600: "#1e4fa3", 700: "#33322f", 800: "#1a1a19", 900: "#000000" },
        accent: { 50: "#fdf0ef", 100: "#f7d9d6", 500: "#d6453b", 600: "#c4372d", 700: "#a8291f" },
      },
      boxShadow: { card: "0 1px 2px rgba(0,0,0,.04)", lift: "0 10px 30px -12px rgba(0,0,0,.18)" },
      borderRadius: { "4xl": "2rem" },
      letterSpacing: { tightish: "-0.011em" },
    },
  },
  plugins: [],
};
