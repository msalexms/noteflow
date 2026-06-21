/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'surface-0':  'rgb(var(--bg-0) / <alpha-value>)',
        'surface-1':  'rgb(var(--bg-1) / <alpha-value>)',
        'surface-2':  'rgb(var(--bg-2) / <alpha-value>)',
        'surface-3':  'rgb(var(--bg-3) / <alpha-value>)',
        border:       'rgb(var(--border) / <alpha-value>)',
        text:         'rgb(var(--text) / <alpha-value>)',
        'text-muted': 'rgb(var(--text-muted) / <alpha-value>)',
        accent:       'rgb(var(--accent) / <alpha-value>)',
        'accent-2':   'rgb(var(--accent-2) / <alpha-value>)',
        'accent-3':   'rgb(var(--accent-3) / <alpha-value>)',
        red:          'rgb(var(--red) / <alpha-value>)',
        cyan:         'rgb(var(--cyan) / <alpha-value>)',
        purple:       'rgb(var(--purple) / <alpha-value>)',
      },
      fontFamily: {
        // `font-mono` is the app's general UI font: it follows the active theme's
        // app font via --app-font-family (set by themeStore), falling back to the
        // mono stack before the theme loads. Real code keeps its own monospace
        // styling in index.css (.ProseMirror code, task badges), so it stays mono.
        mono: ["var(--app-font-family, 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace)"],
      },
    },
  },
  plugins: [],
}
