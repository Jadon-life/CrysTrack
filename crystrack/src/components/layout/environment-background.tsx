'use client';

import React from 'react';
import type { TimePhase } from '@/lib/theme';
import {
  dubaiVideoPoster,
  dubaiVideoScenesForPanels,
  type DubaiVideoScene,
} from '@/lib/environment-video';
import { useTheme } from './theme-provider';

type PanelCount = 1 | 2 | 3;

type NetworkNavigator = Navigator & {
  connection?: {
    saveData?: boolean;
    effectiveType?: string;
  };
};

function panelCountForViewport(): PanelCount {
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (width >= 1180) return 3;
  if (width >= 720 || width > height * 1.22) return 2;
  return 1;
}

function useEnvironmentPlayback(reducedMotion: boolean) {
  const [panelCount, setPanelCount] = React.useState<PanelCount>(1);
  const [saveData, setSaveData] = React.useState(false);

  React.useEffect(() => {
    const navigatorWithConnection = navigator as NetworkNavigator;
    setSaveData(Boolean(navigatorWithConnection.connection?.saveData));

    const update = () => setPanelCount(panelCountForViewport());
    update();
    window.addEventListener('resize', update, { passive: true });
    return () => window.removeEventListener('resize', update);
  }, []);

  return {
    panelCount,
    videoEnabled: !reducedMotion && !saveData,
  };
}

function DubaiVideoPanel({
  scene,
  index,
  panelCount,
}: {
  scene: DubaiVideoScene;
  index: number;
  panelCount: PanelCount;
}) {
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
    <div
      className={`environment-video-wall__panel-wrap environment-video-wall__panel-wrap--${index + 1}`}
      data-panel-count={panelCount}
      aria-hidden="true"
    >
      <video
        ref={videoRef}
        className={`environment-video-wall__panel ${ready ? 'is-ready' : ''}`}
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
    </div>
  );
}

function DubaiVideoWall({
  phase,
  panelCount,
  videoEnabled,
  outgoing = false,
}: {
  phase: TimePhase;
  panelCount: PanelCount;
  videoEnabled: boolean;
  outgoing?: boolean;
}) {
  const scenes = dubaiVideoScenesForPanels(phase, panelCount);
  const poster = dubaiVideoPoster(phase);

  return (
    <div
      className={`environment-video-wall environment-video-wall--${phase} ${outgoing ? 'is-outgoing' : 'is-active'} ${videoEnabled ? '' : 'is-poster-only'}`}
      data-panel-count={panelCount}
      style={{ backgroundImage: `url("${poster}")` }}
      aria-hidden="true"
    >
      {videoEnabled && scenes.map((scene, index) => (
        <DubaiVideoPanel
          key={`${phase}-${scene.src}-${index}`}
          scene={scene}
          index={index}
          panelCount={panelCount}
        />
      ))}
      <div className="environment-video-wall__continuity" />
      <div className="environment-video-wall__grade" />
    </div>
  );
}

export function EnvironmentBackground() {
  const { environment, reducedMotion } = useTheme();
  const { panelCount, videoEnabled } = useEnvironmentPlayback(reducedMotion);
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
    <div className={`environment-background environment-background--${activePhase}`} aria-hidden="true">
      {outgoingPhase && (
        <DubaiVideoWall
          phase={outgoingPhase}
          panelCount={panelCount}
          videoEnabled={videoEnabled}
          outgoing
        />
      )}
      <DubaiVideoWall
        phase={activePhase}
        panelCount={panelCount}
        videoEnabled={videoEnabled}
      />
      <div className="environment-background__readability" />
      <div className={`environment-weather environment-weather--${environment.weather} ${reducedMotion ? 'is-static' : ''}`} />
    </div>
  );
}
