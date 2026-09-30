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
        "surface-base":     "#faf8f5",
        "surface-raised":   "#f2efe9",
        "surface-elevated": "#ede8e0",
      },
    },
  },
  plugins: [],
} satisfies Config;
