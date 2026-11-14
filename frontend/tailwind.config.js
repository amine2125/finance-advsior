/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"] },
      colors: {
        brand: { 50: "#eef4ff", 100: "#dbe6fe", 200: "#bfd3fe", 500: "#3b6cf6", 600: "#2552e0", 700: "#1d42b8", 900: "#152a6b" },
      },
      boxShadow: { card: "0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)", lift: "0 8px 24px -8px rgba(16,24,40,.14)" },
    },
  },
  plugins: [],
};
