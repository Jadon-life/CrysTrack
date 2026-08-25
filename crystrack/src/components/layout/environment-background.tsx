'use client';

import React from 'react';
import { millisecondsUntilNextBackgroundSlot, nextEnvironmentBackgrounds, selectEnvironmentBackground, type EnvironmentBackgroundAsset } from '@/lib/environment';
import { useTheme } from './theme-provider';

function fallbackAsset(asset: EnvironmentBackgroundAsset): EnvironmentBackgroundAsset { return { ...asset, id: `${asset.id}-fallback`, src: asset.fallbackSrc, srcSet: '' }; }

function preloadBackground(asset: EnvironmentBackgroundAsset, timeoutMs = 7000) {
  return new Promise<void>((resolve, reject) => {
    const image = new Image(); let settled = false;
    const finish = async (ok: boolean) => {
      if (settled) return; settled = true; window.clearTimeout(timeout); image.onload = null; image.onerror = null;
      if (!ok) { reject(new Error(`Background failed to load: ${asset.id}`)); return; }
      try { if (typeof image.decode === 'function') await image.decode(); } catch {}
      resolve();
    };
    const timeout = window.setTimeout(() => void finish(false), timeoutMs);
    image.onload = () => void finish(true); image.onerror = () => void finish(false); image.decoding = 'async'; image.src = asset.src;
  });
}

function warmBrowserCache(assets: EnvironmentBackgroundAsset[]) {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  const limit = connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || '') ? 1 : 3;
  const images = assets.slice(0, limit).map((asset) => { const image = new Image(); image.decoding = 'async'; image.src = asset.src; return image; });
  return () => { for (const image of images) { image.onload = null; image.onerror = null; image.src = ''; } };
}

function StillWorld({ asset, phase, outgoing = false }: { asset: EnvironmentBackgroundAsset; phase: string; outgoing?: boolean }) {
  return <div className={`environment-world environment-world--${phase} ${outgoing ? 'is-outgoing' : 'is-active'}`} aria-hidden="true"><img className="environment-still-image" src={asset.src} srcSet={asset.srcSet || undefined} sizes={asset.srcSet ? '100vw' : undefined} alt="" draggable={false} decoding="async" fetchPriority={outgoing ? 'low' : 'high'} style={{ objectPosition: asset.objectPosition }} /><div className="environment-world__grade" /></div>;
}

export function EnvironmentBackground() {
  const { environment, reducedMotion } = useTheme();
  const [clock, setClock] = React.useState(() => Date.now());

  React.useEffect(() => {
    let timer = 0;
    const updateClock = () => setClock(Date.now());
    const scheduleExactBoundary = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { updateClock(); scheduleExactBoundary(); }, millisecondsUntilNextBackgroundSlot(environment, new Date()) + 50);
    };
    scheduleExactBoundary();
    const safety = window.setInterval(updateClock, 5 * 60_000);
    const onVisibility = () => { if (document.visibilityState === 'visible') { updateClock(); scheduleExactBoundary(); } };
    const onFocus = () => { updateClock(); scheduleExactBoundary(); };
    window.addEventListener('focus', onFocus); document.addEventListener('visibilitychange', onVisibility);
    return () => { window.clearTimeout(timer); window.clearInterval(safety); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVisibility); };
  }, [environment.timezone, environment.localTime]);

  const selected = React.useMemo(() => selectEnvironmentBackground(environment, new Date(clock)), [environment.phase, environment.weather, environment.city, environment.countryCode, environment.localTime, environment.timezone, clock]);
  const initialAssetRef = React.useRef<EnvironmentBackgroundAsset | null>(null);
  if (!initialAssetRef.current) initialAssetRef.current = fallbackAsset(selected);
  const initialAsset = initialAssetRef.current;
  const [activeAsset, setActiveAsset] = React.useState(initialAsset); const [activePhase, setActivePhase] = React.useState(environment.phase); const [outgoing, setOutgoing] = React.useState<{ asset: EnvironmentBackgroundAsset; phase: string } | null>(null);
  const activeRef = React.useRef({ asset: initialAsset, phase: environment.phase });
  const upcomingKey = React.useMemo(() => nextEnvironmentBackgrounds(environment, new Date(clock), 3).map((asset) => asset.id).join('|'), [environment.phase, environment.weather, environment.city, environment.countryCode, environment.localTime, environment.timezone, clock]);

  React.useEffect(() => {
    if (selected.id === activeRef.current.asset.id && environment.phase === activeRef.current.phase) return;
    let cancelled = false;
    let transitionTimer = 0;

    const commitAsset = (asset: EnvironmentBackgroundAsset) => {
      if (cancelled) return;
      const previous = activeRef.current;
      activeRef.current = { asset, phase: environment.phase };
      setOutgoing(previous);
      setActiveAsset(asset);
      setActivePhase(environment.phase);
      const duration = reducedMotion ? 0 : 850;
      transitionTimer = window.setTimeout(() => { if (!cancelled) setOutgoing(null); }, duration + 100);
    };

    void preloadBackground(selected)
      .then(() => commitAsset(selected))
      .catch(() => commitAsset(fallbackAsset(selected)));

    return () => {
      cancelled = true;
      window.clearTimeout(transitionTimer);
    };
  }, [selected, environment.phase, reducedMotion]);

  React.useEffect(() => {
    let cacheCleanup: (() => void) | null = null;
    let cleanupTimer = 0;
    const startTimer = window.setTimeout(() => {
      cacheCleanup = warmBrowserCache(nextEnvironmentBackgrounds(environment, new Date(clock), 3));
      cleanupTimer = window.setTimeout(() => {
        cacheCleanup?.();
        cacheCleanup = null;
      }, 90_000);
    }, 600);

    return () => {
      window.clearTimeout(startTimer);
      window.clearTimeout(cleanupTimer);
      cacheCleanup?.();
    };
  }, [upcomingKey, environment, clock]);

  return <div className={`environment-background environment-background--${activePhase}`} data-background-kind="still" data-background-id={activeAsset.id} data-background-rotation="12-photo-dubai-nature" aria-hidden="true">{outgoing && !reducedMotion && <StillWorld asset={outgoing.asset} phase={outgoing.phase} outgoing />}<StillWorld asset={activeAsset} phase={activePhase} /><div className="environment-background__readability" /><div className={`environment-weather environment-weather--${environment.weather} ${reducedMotion ? 'is-static' : ''}`} /></div>;
}
