import React, { useEffect, useRef, useState } from 'react';
import TechText from './components/TechText';

type Line = { text: string; left: number; top: number; width: number; height: number; color: string; font: string; spacing: number };

// Fit the upstream 150px canvas to the existing two-line Manrope heading.
// The real HTML text retains its layout and accessible name at all times.
export default function HeroTechText() {
  const [lines, setLines] = useState<Line[]>([]);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const heading = document.querySelector<HTMLElement>('.hero-headline')!;
    const labels = [...heading.querySelectorAll<HTMLElement>('.hero-title-fallback')];
    const probe = document.createElement('canvas').getContext('2d');
    if (!probe) return;
    let alive = true;
    let raf = 0;
    const measure = () => {
      if (!alive) return;
      delete heading.dataset.techReady;
      const box = heading.getBoundingClientRect();
      setLines(labels.map(label => {
        const style = getComputedStyle(label);
        const rect = label.getBoundingClientRect();
        const size = parseFloat(style.fontSize);
        const text = label.textContent || '';
        probe.font = `600 ${size}px ${style.fontFamily}`;
        const spacing = parseFloat(style.letterSpacing) || 0;
        if ('letterSpacing' in probe) probe.letterSpacing = `${spacing}px`;
        const metrics = probe.measureText(text);
        const inkWidth = metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight;
        const inkHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
        const width = inkWidth / .9;
        const height = inkHeight / .66;
        const fontAscent = metrics.fontBoundingBoxAscent ?? size * .8;
        const fontDescent = metrics.fontBoundingBoxDescent ?? size * .2;
        const baseline = (rect.height - fontAscent - fontDescent) / 2 + fontAscent;
        const center = baseline + (metrics.actualBoundingBoxDescent - metrics.actualBoundingBoxAscent) / 2;
        return { text, width, height, left: rect.left - box.left - width * .05, top: rect.top - box.top + center - height / 2, color: style.color, font: style.fontFamily, spacing: spacing / size };
      }));
    };
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    observer.observe(heading);
    document.fonts.ready.then(schedule);
    document.fonts.addEventListener('loadingdone', schedule);
    schedule();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.fonts.removeEventListener('loadingdone', schedule);
      delete heading.dataset.techReady;
    };
  }, []);

  useEffect(() => {
    if (!lines.length) return;
    const heading = document.querySelector<HTMLElement>('.hero-headline')!;
    let frame = 0, tries = 0;
    const ready = () => {
      const canvases = [...root.current!.querySelectorAll('canvas')];
      const painted = canvases.length === lines.length && canvases.every(canvas => {
        const ctx = canvas.getContext('2d');
        if (!ctx || !canvas.width || !canvas.height) return false;
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 3; i < data.length; i += 4) if (data[i]) return true;
        return false;
      });
      if (painted) heading.dataset.techReady = 'true';
      else if (++tries < 60) frame = requestAnimationFrame(ready);
    };
    frame = requestAnimationFrame(ready);
    return () => { cancelAnimationFrame(frame); delete heading.dataset.techReady; };
  }, [lines]);

  return <div className="hero-tech-lines" ref={root}>
    {lines.map((line, index) => <div key={index} className="hero-tech-line" ref={node => {
      // CSSOM assignments preserve the site's strict style-src policy.
      if (node) Object.assign(node.style, { left: `${line.left}px`, top: `${line.top}px`, width: `${line.width}px`, height: `${line.height}px` });
    }}>
      <TechText text={line.text} fontFamily={line.font} fontWeight={600} fontSize={150} letterSpacing={line.spacing} color={line.color} accentColor={line.color} align="left" reveal="letter" dashLength={4} dashGap={2} specks={15} intro="none" introDuration={2} clickKick guides={false} />
    </div>)}
  </div>;
}
