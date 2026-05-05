import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#fff8e7",
          100: "#ffefc2",
          200: "#f8dc8a",
          500: "#b45309",
          600: "#92400e",
          700: "#78350f",
          900: "#4b2a0c",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Helvetica", "Arial"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas"],
      },
    },
  },
  plugins: [],
};

export default config;
