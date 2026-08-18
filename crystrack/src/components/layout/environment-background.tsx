'use client';

import React, { useEffect, useRef } from 'react';
import { environmentBackgroundAsset } from '@/lib/environment';
import { useTheme } from './theme-provider';

export function EnvironmentBackground() {
  const { environment, reducedMotion } = useTheme();
  const asset = environmentBackgroundAsset(environment.phase);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reducedMotion) return;

    let frame = 0;
    const onPointerMove = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const element = rootRef.current;
        if (!element) return;

        const x = ((event.clientX / Math.max(1, window.innerWidth)) - 0.5) * 2;
        const y = ((event.clientY / Math.max(1, window.innerHeight)) - 0.5) * 2;
        element.style.setProperty('--scene-x', x.toFixed(3));
        element.style.setProperty('--scene-y', y.toFixed(3));
      });
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onPointerMove);
    };
  }, [reducedMotion]);

  return (
    <div
      ref={rootRef}
      className={`environment-background environment-background--${environment.phase} ${reducedMotion ? 'is-static' : ''}`}
      aria-hidden="true"
    >
      <div className="environment-background__scene">
        <img
          key={asset.src}
          src={asset.src}
          srcSet={asset.srcSet}
          sizes="100vw"
          alt=""
          className="environment-background__image"
          draggable={false}
        />
        <div className="environment-background__light" />
      </div>
      <div className="environment-background__atmosphere" />
      <div className="environment-background__foreground" />
      <div className="environment-background__readability" />
      <div className={`environment-weather environment-weather--${environment.weather} ${reducedMotion ? 'is-static' : ''}`} />
    </div>
  );
}
