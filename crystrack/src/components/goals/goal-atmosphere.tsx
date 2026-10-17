'use client';
import { useEffect, useRef } from 'react';
export function GoalAtmosphere({
  phase,
  reducedMotion,
}: {
  phase: string;
  reducedMotion: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current,
      ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0,
      last = 0,
      x = 0.5,
      y = 0.5,
      width = 1,
      height = 1;
    const paint = (t: number) => {
      ctx.clearRect(0, 0, width, height);
      const drift = Math.sin(t / 12000) * 0.06;
      const gold = ctx.createRadialGradient(
        width * (x * 0.3 + 0.35 + drift),
        height * (y * 0.2 + 0.3),
        0,
        width * 0.5,
        height * 0.4,
        width * 0.65,
      );
      gold.addColorStop(
        0,
        ({morning:'rgba(100,180,240,.16)',day:'rgba(120,190,220,.16)',golden:'rgba(217,182,93,.18)',evening:'rgba(180,120,200,.16)',night:'rgba(80,100,200,.16)'}[phase] || 'rgba(217,182,93,.15)'),
      );
      gold.addColorStop(1, 'transparent');
      ctx.fillStyle = gold;
      ctx.fillRect(0, 0, width, height);
    };
    const resize = () => {
      width = innerWidth;
      height = innerHeight;
      const dpr = Math.min(devicePixelRatio, 1.5);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint(0);
    };
    const tick = (t: number) => {
      if (t - last > 33) {
        paint(t);
        last = t;
      }
      frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      if (!reducedMotion && !media.matches && !document.hidden)
        frame = requestAnimationFrame(tick);
      else paint(0);
    };
    const move = (e: PointerEvent) => {
      if (!reducedMotion && !media.matches) {
        x = e.clientX / width;
        y = e.clientY / height;
      }
    };
    resize();
    sync();
    addEventListener('resize', resize);
    addEventListener('pointermove', move);
    media.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener('resize', resize);
      removeEventListener('pointermove', move);
      media.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [phase, reducedMotion]);
  return <canvas ref={ref} aria-hidden="true" className="goal-atmosphere" />;
}
