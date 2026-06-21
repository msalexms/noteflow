import { useEffect, useState } from 'react';

type Theme = 'dark' | 'light';
const KEY = 'noteflow:web-theme';

function current(): Theme {
  if (typeof document === 'undefined') return 'dark';
  return (document.documentElement.getAttribute('data-theme') as Theme) || 'dark';
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');

  // Sync from the value the inline head script already applied.
  useEffect(() => setTheme(current()), []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
    // Fire a synapse: brief accent pulse on the document for feedback.
    document.documentElement.dispatchEvent(new CustomEvent('noteflow:theme', { detail: next }));
    setTheme(next);
  }

  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      className="fire grid h-9 w-9 place-items-center rounded-lg border border-border text-text-muted transition-colors hover:text-accent"
    >
      {isDark ? <Sun /> : <Moon />}
    </button>
  );
}

function Sun() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </svg>
  );
}

function Moon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}
