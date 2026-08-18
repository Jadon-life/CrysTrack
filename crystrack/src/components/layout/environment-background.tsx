'use client';

import React from 'react';
import { environmentBackgroundAsset } from '@/lib/environment';
import { useTheme } from './theme-provider';

export function EnvironmentBackground() {
  const { environment, reducedMotion } = useTheme();
  const asset = environmentBackgroundAsset(environment.phase);

  return (
    <div className="environment-background" aria-hidden="true">
      <img
        key={asset.src}
        src={asset.src}
        srcSet={asset.srcSet}
        sizes="100vw"
        alt=""
        className="environment-background__image"
        draggable={false}
      />
      <div className="environment-background__readability" />
      <div className={`environment-weather environment-weather--${environment.weather} ${reducedMotion ? 'is-static' : ''}`} />
    </div>
  );
}
