import React, { useEffect, useState } from 'react';
import GridDistortion from './components/GridDistortion';

const preferenceKey = 'tinytrail.hero-motion-paused';
const motionQuery = '(prefers-reduced-motion: reduce)';
const mobileQuery = '(max-width: 768px)';

export default function HeroMotion() {
  const [theme, setTheme] = useState(document.documentElement.dataset.mode);
  const [reduced, setReduced] = useState(matchMedia(motionQuery).matches);
  const [mobile, setMobile] = useState(matchMedia(mobileQuery).matches);
  const [visible, setVisible] = useState(!document.hidden);
  const [inView, setInView] = useState(true);
  const [failed, setFailed] = useState(false);
  const [paused, setPaused] = useState(() => {
    try {
      return localStorage.getItem(preferenceKey) === 'true' || Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);
    } catch { return false; }
  });

  useEffect(() => {
    const motion = matchMedia(motionQuery), size = matchMedia(mobileQuery);
    const appearance = () => setTheme(document.documentElement.dataset.mode);
    const media = () => { setReduced(motion.matches); setMobile(size.matches); };
    const visibility = () => setVisible(!document.hidden);
    const lost = () => setFailed(true);
    const host = document.querySelector('[data-hero-motion]')!;
    const observer = new IntersectionObserver(entries => setInView(entries.some(entry => entry.isIntersecting)), { rootMargin: '100px' });
    observer.observe(host);
    motion.addEventListener('change', media);
    size.addEventListener('change', media);
    addEventListener('tinytrail:appearance', appearance);
    document.addEventListener('visibilitychange', visibility);
    host.addEventListener('webglcontextlost', lost, true);
    return () => {
      observer.disconnect();
      motion.removeEventListener('change', media);
      size.removeEventListener('change', media);
      removeEventListener('tinytrail:appearance', appearance);
      document.removeEventListener('visibilitychange', visibility);
      host.removeEventListener('webglcontextlost', lost, true);
    };
  }, []);

  const active = !paused && !reduced && visible && inView && !failed;
  const imageSrc = mobile
    ? theme === 'dark' ? '/landing-hero-dark.webp' : '/landing-hero.webp'
    : theme === 'dark' ? '/hero-grid-dark.webp' : '/hero-grid-light.webp';

  function toggle() {
    const next = !paused;
    setPaused(next);
    try { localStorage.setItem(preferenceKey, String(next)); } catch {}
  }

  return <>
    <div className="hero-distortion" aria-hidden="true" data-motion-active={active} data-motion-image={imageSrc}>
      {active && <GridDistortion imageSrc={imageSrc} grid={15} radius={0.18} strength={0.15} relaxation={0.96} mode="drag" softness={0} chroma={0} idle={0.3} clickRipple={true} intro={true} className="hero-distortion-surface" />}
    </div>
    {!reduced && !failed && <button type="button" className="button secondary hero-motion-toggle" aria-pressed={paused} onClick={toggle}>
      <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14" fill="currentColor">{paused ? <path d="M7 4v16l13-8z"/> : <path d="M6 4h4v16H6zm8 0h4v16h-4z"/>}</svg>
      {paused ? 'Play motion' : 'Pause motion'}
    </button>}
  </>;
}
