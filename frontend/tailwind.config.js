/** @type {import('tailwindcss').Config} */
// Visual system taken from AEGIS: warm off-white surfaces, near-black ink, ONE high-contrast accent (cobalt).
// ULYSSE signal colours (ok / attention / pause) are semantic only, never decoration.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Instrument Sans'", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        display: ["Jost", "'Futura PT'", "Futura", "'Century Gothic'", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        ink: { DEFAULT: "#151413", soft: "#56544f", muted: "#76736c" },
        canvas: "#f6f4ef",
        surface: "#fbfaf7",
        line: "rgba(21,20,19,0.08)",
        primary: { 50: "#eef1ff", 100: "#dde3ff", 200: "#bcc7ff", 400: "#5b72ff", 500: "#3350ff", 600: "#2440eb", 700: "#1c32bd" },
        // semantic (ULYSSE signal levels)
        gain: { 50: "#e9f6ef", 100: "#cdebdb", 600: "#0f8a5f", 700: "#0b7350" },
        warn: { 50: "#fff6e0", 100: "#fde7b0", 500: "#e59a00", 700: "#8a5a00" },
        loss: { 50: "#fdf0ef", 100: "#f7d9d6", 500: "#d6453b", 600: "#c4372d", 700: "#a8291f" },
      },
      boxShadow: {
        card: "0 0 0 1px rgba(21,20,19,0.05), 0 1px 2px rgba(21,20,19,0.03)",
        lift: "0 0 0 1px rgba(21,20,19,0.06), 0 12px 40px -16px rgba(21,20,19,0.18)",
        glow: "0 0 0 1px rgba(51,80,255,0.10), 0 18px 50px -20px rgba(51,80,255,0.45)",
      },
      borderRadius: { "4xl": "2rem" },
    },
  },
  plugins: [],
};
