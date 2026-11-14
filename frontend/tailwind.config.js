/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"] },
      colors: {
        ink: { 950: "#070b14", 900: "#0b1220", 850: "#0f172a", 800: "#141d33", 700: "#1e2a47", 600: "#2a3a5f" },
        aegis: { 400: "#5eead4", 500: "#2dd4bf", 600: "#14b8a6" },
      },
      boxShadow: { glow: "0 0 0 1px rgba(45,212,191,.25), 0 8px 30px -12px rgba(45,212,191,.35)" },
    },
  },
  plugins: [],
};
