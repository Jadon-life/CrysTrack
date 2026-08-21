'use client';

import React from 'react';
import {
  selectEnvironmentBackground,
  type EnvironmentBackgroundAsset,
} from '@/lib/environment';
import { useTheme } from './theme-provider';

function preloadBackground(asset: EnvironmentBackgroundAsset) {
  return new Promise<void>((resolve) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = asset.src;
  });
}

function StillWorld({
  asset,
  phase,
  outgoing = false,
}: {
  asset: EnvironmentBackgroundAsset;
  phase: string;
  outgoing?: boolean;
}) {
  return (
    <div
      className={`environment-world environment-world--${phase} ${outgoing ? 'is-outgoing' : 'is-active'}`}
      aria-hidden="true"
    >
      <img
        className="environment-still-image"
        src={asset.src}
        srcSet={asset.srcSet}
        sizes="100vw"
        alt=""
        draggable={false}
        decoding="async"
        fetchPriority={outgoing ? 'low' : 'high'}
        style={{ objectPosition: asset.objectPosition }}
      />
      <div className="environment-world__grade" />
    </div>
  );
}

export function EnvironmentBackground() {
  const { environment, reducedMotion } = useTheme();

  const selected = React.useMemo(
    () => selectEnvironmentBackground(environment),
    [
      environment.phase,
      environment.weather,
      environment.city,
      environment.countryCode,
      environment.localTime,
    ],
  );

  const [activeAsset, setActiveAsset] = React.useState(selected);
  const [activePhase, setActivePhase] = React.useState(environment.phase);
  const [outgoing, setOutgoing] = React.useState<{
    asset: EnvironmentBackgroundAsset;
    phase: string;
  } | null>(null);

  const activeRef = React.useRef({
    asset: selected,
    phase: environment.phase,
  });

  React.useEffect(() => {
    if (selected.id === activeRef.current.asset.id && environment.phase === activeRef.current.phase) {
      return;
    }

    let cancelled = false;

    void preloadBackground(selected).then(() => {
      if (cancelled) return;

      const previous = activeRef.current;
      activeRef.current = { asset: selected, phase: environment.phase };

      setOutgoing(previous);
      setActiveAsset(selected);
      setActivePhase(environment.phase);

      const duration = reducedMotion ? 0 : 1400;
      window.setTimeout(() => {
        if (!cancelled) setOutgoing(null);
      }, duration + 100);
    });

    return () => {
      cancelled = true;
    };
  }, [selected, environment.phase, reducedMotion]);

  return (
    <div
      className={`environment-background environment-background--${activePhase}`}
      data-background-kind="still"
      data-background-id={activeAsset.id}
      aria-hidden="true"
    >
      {outgoing && !reducedMotion && (
        <StillWorld
          asset={outgoing.asset}
          phase={outgoing.phase}
          outgoing
        />
      )}

      <StillWorld
        asset={activeAsset}
        phase={activePhase}
      />

      <div className="environment-background__readability" />
      <div
        className={`environment-weather environment-weather--${environment.weather} ${reducedMotion ? 'is-static' : ''}`}
      />
    </div>
  );
}
