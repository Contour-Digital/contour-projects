import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#0f766e", strong: "#115e59", soft: "#ccfbf1" },
      },
    },
  },
  plugins: [],
};

export default config;
