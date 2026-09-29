import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/store/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Custom design tokens — matches CSS variables in globals.css
        "surface-base": "#0f1117",
        "surface-raised": "#1a1d27",
        "surface-elevated": "#22263a",
      },
    },
  },
  plugins: [],
} satisfies Config;
