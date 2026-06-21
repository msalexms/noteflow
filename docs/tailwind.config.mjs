/** @type {import('tailwindcss').Config} */
// Mirrors the app's token contract (rgb(var(--x))) so utilities map onto the
// same theme variables. Tokens live in src/styles/tokens.css.
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        'surface-0': 'rgb(var(--bg-0) / <alpha-value>)',
        'surface-1': 'rgb(var(--bg-1) / <alpha-value>)',
        'surface-2': 'rgb(var(--bg-2) / <alpha-value>)',
        'surface-3': 'rgb(var(--bg-3) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        text: 'rgb(var(--text) / <alpha-value>)',
        'text-muted': 'rgb(var(--text-muted) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        'accent-2': 'rgb(var(--accent-2) / <alpha-value>)',
        'accent-3': 'rgb(var(--accent-3) / <alpha-value>)',
        red: 'rgb(var(--red) / <alpha-value>)',
        cyan: 'rgb(var(--cyan) / <alpha-value>)',
        purple: 'rgb(var(--purple) / <alpha-value>)',
        orange: 'rgb(var(--orange) / <alpha-value>)',
        pink: 'rgb(var(--pink) / <alpha-value>)',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', '"Cascadia Code"', 'monospace'],
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      maxWidth: {
        container: '1140px',
      },
    },
  },
  plugins: [],
};
