import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FBF8F2",
        ink: "#20281D",
        moss: {
          DEFAULT: "#5C6B37",
          light: "#8A9A5B",
          dark: "#3E4A24"
        },
        clay: {
          DEFAULT: "#9C4A2A",
          light: "#C97A50"
        },
        dende: "#D4A72C",
        line: "#C9C2AE",
        card: "#F3EEE1"
      },
      fontFamily: {
        display: ["Fraunces", "ui-serif", "Georgia", "serif"],
        body: ["Source Serif 4", "ui-serif", "Georgia", "serif"],
        sans: ["Inter", "ui-sans-serif", "system-ui"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular"]
      },
      maxWidth: {
        prose: "72ch"
      }
    }
  },
  plugins: []
};
export default config;
