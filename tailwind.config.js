/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'surface-0': '#13141e',
        'surface-1': '#1a1b26',
        'surface-2': '#24283b',
        'surface-3': '#2f3449',
        border:      '#2f3449',
        text:        '#c0caf5',
        'text-muted': '#565f89',
        accent:      '#7aa2f7',
        'accent-2':  '#9ece6a',
        'accent-3':  '#e0af68',
        red:         '#f7768e',
        cyan:        '#7dcfff',
        purple:      '#bb9af7',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', '"Cascadia Code"', 'monospace'],
      },
    },
  },
  plugins: [],
}
