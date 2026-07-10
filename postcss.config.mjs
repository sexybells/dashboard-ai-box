// Tailwind CSS v4 uses a dedicated PostCSS plugin. Next.js 16 (Turbopack) picks
// this config up automatically for `@import "tailwindcss"` in globals.css.
const config = {
  plugins: {
    "@tailwindcss/postcss": {}
  }
};

export default config;
