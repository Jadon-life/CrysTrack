'use client';

import React from 'react';
import type { TimePhase } from '@/lib/theme';
import {
  dubaiVideoPoster,
  dubaiVideoScenesForPanels,
  type DubaiVideoScene,
} from '@/lib/environment-video';
import {
  youtubeEnvironmentEmbedUrl,
  youtubeEnvironmentScene,
} from '@/lib/environment-youtube';
import { useTheme } from './theme-provider';

type NetworkNavigator = Navigator & {
  connection?: {
    saveData?: boolean;
    effectiveType?: string;
  };
};

type EnvironmentMode = 'youtube' | 'local' | 'poster';

function environmentModeForViewport(reducedMotion: boolean, saveData: boolean): EnvironmentMode {
  if (reducedMotion || saveData) return 'poster';

  const width = window.innerWidth;
  const height = window.innerHeight;
  const landscapeEnough = width / Math.max(height, 1) >= 1.22;

  // Wide/landscape screens get one full-bleed 16:9 YouTube environment.
  // Portrait/narrow screens use one of the user's local portrait Dubai clips.
  if (width >= 900 && landscapeEnough) return 'youtube';
  return 'local';
}

function useEnvironmentPlayback(reducedMotion: boolean) {
  const [saveData, setSaveData] = React.useState(false);
  const [mode, setMode] = React.useState<EnvironmentMode>('poster');

  React.useEffect(() => {
    const navigatorWithConnection = navigator as NetworkNavigator;
    const dataSaver = Boolean(navigatorWithConnection.connection?.saveData);
    setSaveData(dataSaver);

    const update = () => {
      setMode(environmentModeForViewport(reducedMotion, dataSaver));
    };

    update();
    window.addEventListener('resize', update, { passive: true });
    return () => window.removeEventListener('resize', update);
  }, [reducedMotion]);

  React.useEffect(() => {
    setMode(environmentModeForViewport(reducedMotion, saveData));
  }, [reducedMotion, saveData]);

  return mode;
}

function LocalDubaiVideo({ scene }: { scene: DubaiVideoScene }) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [ready, setReady] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  const resetPlayback = React.useCallback((video: HTMLVideoElement) => {
    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;

    if (Number.isFinite(video.duration) && video.duration > 0) {
      const safeStart = Math.min(scene.startAt, Math.max(0, video.duration - 0.35));
      video.currentTime = safeStart;
    }

    void video.play().catch(() => null);
  }, [scene.startAt]);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;
  }, []);

  if (failed) return null;

  return (
    <video
      ref={videoRef}
      className={`environment-local-video ${ready ? 'is-ready' : ''}`}
      src={scene.src}
      autoPlay
      muted
      playsInline
      preload="auto"
      controls={false}
      disablePictureInPicture
      aria-hidden="true"
      tabIndex={-1}
      style={{ objectPosition: scene.objectPosition || '50% 50%' }}
      onLoadedMetadata={(event) => resetPlayback(event.currentTarget)}
      onCanPlay={() => setReady(true)}
      onEnded={(event) => resetPlayback(event.currentTarget)}
      onVolumeChange={(event) => {
        const video = event.currentTarget;
        if (!video.muted || video.volume !== 0) {
          video.muted = true;
          video.volume = 0;
        }
      }}
      onError={() => setFailed(true)}
    />
  );
}

function YouTubeDubaiVideo({ phase }: { phase: TimePhase }) {
  const scene = youtubeEnvironmentScene(phase);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    setLoaded(false);
  }, [scene.videoId, scene.startAt]);

  return (
    <div className={`environment-youtube ${loaded ? 'is-loaded' : ''}`} aria-hidden="true">
      <iframe
        key={`${scene.videoId}-${scene.startAt}`}
        className="environment-youtube__iframe"
        src={youtubeEnvironmentEmbedUrl(scene)}
        title=""
        tabIndex={-1}
        aria-hidden="true"
        allow="autoplay; encrypted-media"
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={() => setLoaded(true)}
      />
      <div className="environment-youtube__interaction-shield" />
    </div>
  );
}

function EnvironmentWorld({
  phase,
  mode,
  outgoing = false,
}: {
  phase: TimePhase;
  mode: EnvironmentMode;
  outgoing?: boolean;
}) {
  const poster = dubaiVideoPoster(phase);
  const localScene = dubaiVideoScenesForPanels(phase, 1)[0];

  return (
    <div
      className={`environment-world environment-world--${phase} ${outgoing ? 'is-outgoing' : 'is-active'}`}
      style={{ backgroundImage: `url("${poster}")` }}
      aria-hidden="true"
    >
      {mode === 'youtube' && <YouTubeDubaiVideo phase={phase} />}
      {mode === 'local' && <LocalDubaiVideo scene={localScene} />}
      <div className="environment-world__grade" />
    </div>
  );
}

export function EnvironmentBackground() {
  const { environment, reducedMotion } = useTheme();
  const mode = useEnvironmentPlayback(reducedMotion);
  const [activePhase, setActivePhase] = React.useState<TimePhase>(environment.phase);
  const [outgoingPhase, setOutgoingPhase] = React.useState<TimePhase | null>(null);
  const activePhaseRef = React.useRef<TimePhase>(environment.phase);

  React.useEffect(() => {
    if (environment.phase === activePhaseRef.current) return;

    const previous = activePhaseRef.current;
    activePhaseRef.current = environment.phase;
    setOutgoingPhase(previous);
    setActivePhase(environment.phase);

    const timer = window.setTimeout(() => setOutgoingPhase(null), 2200);
    return () => window.clearTimeout(timer);
  }, [environment.phase]);

  return (
    <div
      className={`environment-background environment-background--${activePhase}`}
      data-environment-mode={mode}
      aria-hidden="true"
    >
      {outgoingPhase && (
        <EnvironmentWorld
          phase={outgoingPhase}
          mode={mode}
          outgoing
        />
      )}

      <EnvironmentWorld
        phase={activePhase}
        mode={mode}
      />

      <div className="environment-background__readability" />
      <div
        className={`environment-weather environment-weather--${environment.weather} ${reducedMotion ? 'is-static' : ''}`}
      />
    </div>
  );
}
