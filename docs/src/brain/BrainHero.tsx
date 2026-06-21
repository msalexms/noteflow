import { Suspense, lazy, useEffect, useState } from 'react';
import { SAMPLE_BRAIN_GRAPH } from './sampleGraph';

// three.js is heavy — only fetched (its own chunk) when we actually render the 3D brain.
const BrainScene = lazy(() => import('./BrainScene'));

function detectWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

// Static fallback for no-WebGL or reduced-motion: a calm glowing core, no animation.
function Poster() {
  return (
    <div className="absolute inset-0 grid place-items-center overflow-hidden" aria-hidden="true">
      <div
        className="h-[60%] max-h-[420px] w-[60%] max-w-[420px] rounded-full"
        style={{
          background:
            'radial-gradient(circle at 50% 45%, rgb(var(--accent) / 0.5), rgb(var(--accent) / 0.12) 40%, transparent 68%)',
          filter: 'blur(8px)',
        }}
      />
    </div>
  );
}

type Mode = 'pending' | '3d' | 'static';

export default function BrainHero() {
  const [mode, setMode] = useState<Mode>('pending');
  const [themeKey, setThemeKey] = useState('dark');

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setMode(detectWebGL() && !reduce ? '3d' : 'static');

    const read = () => setThemeKey(document.documentElement.getAttribute('data-theme') || 'dark');
    read();
    document.documentElement.addEventListener('noteflow:theme', read as EventListener);
    return () => document.documentElement.removeEventListener('noteflow:theme', read as EventListener);
  }, []);

  return (
    <div className="absolute inset-0">
      {mode === '3d' ? (
        <Suspense fallback={<Poster />}>
          <BrainScene model={SAMPLE_BRAIN_GRAPH} themeKey={themeKey} showContentEdges />
        </Suspense>
      ) : (
        <Poster />
      )}
    </div>
  );
}
