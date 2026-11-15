/** @type {import('tailwindcss').Config} */
// Flagship light theme: warm off-white surfaces, near-black ink, ONE high-contrast accent (cobalt).
// Green / red are semantic only (gains / losses), never decoration. Depth = 1px translucent borders, frosted glass, ambient glows.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Instrument Sans'", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        display: ["Jost", "'Futura PT'", "Futura", "'Century Gothic'", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        ink: { DEFAULT: "#151413", soft: "#56544f", muted: "#8e8b84" },
        canvas: "#f6f4ef",
        surface: "#fbfaf7",
        line: "rgba(21,20,19,0.07)",
        // the single accent
        primary: { 50: "#eef1ff", 100: "#dde3ff", 200: "#bcc7ff", 400: "#5b72ff", 500: "#3350ff", 600: "#2440eb", 700: "#1c32bd" },
        // semantic
        gain: { 50: "#e9f6ef", 600: "#0f8a5f", 700: "#0b7350" },
        accent: { 50: "#fdf0ef", 100: "#f7d9d6", 500: "#d6453b", 600: "#c4372d", 700: "#a8291f" },
        // legacy aliases kept for older components (mapped onto the new system)
        gold: { 50: "#eef1ff", 100: "#dde3ff", 400: "#5b72ff", 500: "#3350ff", 600: "#2440eb" },
        brand: { 50: "#f1efe9", 100: "#e8e5dd", 200: "#d6d2c8", 300: "#a19d93", 500: "#3350ff", 600: "#2440eb", 700: "#2b2a27", 800: "#151413", 900: "#000000" },
      },
      boxShadow: {
        card: "0 0 0 1px rgba(21,20,19,0.05), 0 1px 2px rgba(21,20,19,0.03)",
        lift: "0 0 0 1px rgba(21,20,19,0.06), 0 12px 40px -16px rgba(21,20,19,0.18)",
        glow: "0 0 0 1px rgba(51,80,255,0.10), 0 18px 50px -20px rgba(51,80,255,0.45)",
        inset: "inset 0 1px 0 rgba(255,255,255,0.7)",
      },
      borderRadius: { "4xl": "2rem" },
      letterSpacing: { tightest: "-0.045em" },
    },
  },
  plugins: [],
};
