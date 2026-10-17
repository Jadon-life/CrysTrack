'use client';

import React from 'react';
import Image from 'next/image';
import { millisecondsUntilNextBackgroundSlot, selectEnvironmentBackground } from '@/lib/environment';
import { useTheme } from './theme-provider';

export function EnvironmentBackground() {
  const { environment } = useTheme();
  const [clock, setClock] = React.useState(() => Date.now());

  React.useEffect(() => {
    let timer = 0;
    const resync = () => setClock(Date.now());
    const scheduleBoundary = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        resync();
        scheduleBoundary();
      }, millisecondsUntilNextBackgroundSlot(environment, new Date()));
    };

    scheduleBoundary();
    const onFocus = () => { resync(); scheduleBoundary(); };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') { resync(); scheduleBoundary(); }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [environment]);

  const asset = React.useMemo(
    () => selectEnvironmentBackground(environment, new Date(clock)),
    [environment, clock],
  );

  return (
    <div
      className={`environment-background environment-background--${environment.phase} environment-background--static-safe`}
      data-background-kind="still"
      data-background-id={asset.id}
      data-background-rotation="8-photo-static-v10"
      aria-hidden="true"
      style={{ animation: 'none', transition: 'none', transform: 'none', filter: 'none' }}
    >
      <Image
        width={1920}
        height={1080}
        unoptimized
        loading="eager"
        key={asset.id}
        className="environment-stability-image"
        src={asset.src}
        alt=""
        draggable={false}
        decoding="async"
        fetchPriority="high"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          display: 'block',
          objectFit: 'cover',
          objectPosition: asset.objectPosition,
          userSelect: 'none',
          pointerEvents: 'none',
          animation: 'none',
          transition: 'none',
          transform: 'none',
          filter: 'none',
        }}
      />
      <div
        className="environment-background__readability"
        style={{ animation: 'none', transition: 'none', pointerEvents: 'none' }}
      />
    </div>
  );
}
