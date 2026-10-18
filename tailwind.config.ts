import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // From the Contour Digital logo: blue #0098ff and navy #08245b.
        // `strong` is a darker blue for text and hovers, since the logo blue is too light for small text on white.
        brand: { DEFAULT: "#0098ff", strong: "#0070c0", soft: "#e0f1ff", navy: "#08245b", "navy-strong": "#051940" },
      },
    },
  },
  plugins: [],
};

export default config;
