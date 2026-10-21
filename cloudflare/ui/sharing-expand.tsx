import React, { useEffect, useLayoutEffect, useState } from 'react';
import ScrollExpand from './components/ScrollExpand';

const query = '(max-width: 768px), (max-height: 560px), (prefers-reduced-motion: reduce)';
function pausedPreference() {
  try { return localStorage.getItem('tinytrail.hero-motion-paused') === 'true' || Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData); }
  catch { return false; }
}

export default function SharingExpand() {
  const [staticMode, setStaticMode] = useState(matchMedia(query).matches);
  const [paused, setPaused] = useState(pausedPreference);
  const [theme, setTheme] = useState(document.documentElement.dataset.mode);
  const section = document.querySelector<HTMLElement>('.sharing-story')!;
  const original = section.querySelector<HTMLElement>('.sharing-copy')!;
  const [content] = useState(() => ({
    heading: original.querySelector('h2')!.innerText,
    description: original.querySelector('p')!.textContent,
    points: [...original.querySelectorAll('.sharing-points>div')].map(point => ({
      title: point.querySelector('h3')!.textContent,
      text: point.querySelector('p')!.textContent
    }))
  }));
  const enabled = !staticMode && !paused;

  useEffect(() => {
    const media = matchMedia(query);
    const resize = () => setStaticMode(media.matches);
    const appearance = () => setTheme(document.documentElement.dataset.mode);
    const motion = (event: Event) => setPaused((event as CustomEvent).detail.paused);
    const storage = () => setPaused(pausedPreference());
    media.addEventListener('change', resize);
    addEventListener('tinytrail:appearance', appearance);
    addEventListener('tinytrail:motion', motion);
    addEventListener('storage', storage);
    return () => {
      media.removeEventListener('change', resize);
      removeEventListener('tinytrail:appearance', appearance);
      removeEventListener('tinytrail:motion', motion);
      removeEventListener('storage', storage);
    };
  }, []);

  useLayoutEffect(() => {
    if (enabled) section.dataset.expandReady = 'true';
    return () => { delete section.dataset.expandReady; };
  }, [enabled, section]);

  if (!enabled) return null;
  return <>
    <div className="sharing-expand-intro">
      <div className="sharing-expand-heading">{content.heading}</div>
      <p>{content.description}</p>
    </div>
    <ScrollExpand className="sharing-expand-scroll" src={theme === 'dark' ? '/sharing-art-dark.webp' : '/sharing-art.webp'} alt="" useWindowScroll startWidth={68} startHeight={70} startRadius={12} endRadius={0} mediaZoom={1.15} scrollDistance={0.65} holdDistance={0.1} smoothing={0.1} overlayScrim={0}>
      <div className="sharing-expand-caption">
        {content.points.map(point => <div key={point.title}><h3>{point.title}</h3><p>{point.text}</p></div>)}
      </div>
    </ScrollExpand>
  </>;
}
