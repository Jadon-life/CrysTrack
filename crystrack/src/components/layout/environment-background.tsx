'use client';

import React from 'react';
import type { TimePhase } from '@/lib/theme';
import {
  dubaiVideoPoster,
  dubaiVideoScenesForPanels,
  type DubaiVideoScene,
} from '@/lib/environment-video';
import {
  youtubeEnvironmentScene,
  type YouTubeEnvironmentScene,
} from '@/lib/environment-youtube';
import { useTheme } from './theme-provider';

type NetworkNavigator = Navigator & {
  connection?: {
    saveData?: boolean;
    effectiveType?: string;
  };
};

type EnvironmentMode = 'youtube' | 'local' | 'poster';

type YouTubePlayer = {
  mute: () => void;
  setVolume: (volume: number) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getAvailablePlaybackRates: () => number[];
  setPlaybackRate: (rate: number) => void;
  destroy: () => void;
};

type YouTubePlayerEvent = {
  target: YouTubePlayer;
  data?: number;
};

type YouTubeNamespace = {
  Player: new (
    element: HTMLElement,
    options: {
      width: string;
      height: string;
      videoId: string;
      playerVars: Record<string, string | number>;
      events: {
        onReady: (event: YouTubePlayerEvent) => void;
        onStateChange: (event: YouTubePlayerEvent) => void;
        onError: () => void;
      };
    },
  ) => YouTubePlayer;
  PlayerState: {
    ENDED: number;
    PLAYING: number;
  };
};

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<YouTubeNamespace> | null = null;

function loadYouTubeApi() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('YouTube API is browser-only'));
  }

  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise<YouTubeNamespace>((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error('YouTube Player API did not initialise'));
    };

    const existing = document.querySelector<HTMLScriptElement>('script[data-crystrack-youtube-api]');
    if (existing) return;

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.dataset.crystrackYoutubeApi = '1';
    script.onerror = () => reject(new Error('YouTube Player API failed to load'));
    document.head.appendChild(script);
  });

  return youtubeApiPromise;
}

function environmentModeForViewport(reducedMotion: boolean, saveData: boolean): EnvironmentMode {
  if (reducedMotion || saveData) return 'poster';

  const width = window.innerWidth;
  const height = window.innerHeight;
  const landscapeEnough = width / Math.max(height, 1) >= 1.22;

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

    const update = () => setMode(environmentModeForViewport(reducedMotion, dataSaver));
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

function selectSupportedPlaybackRate(player: YouTubePlayer, requested: number) {
  const rates = [...(player.getAvailablePlaybackRates?.() || [1])].sort((a, b) => a - b);
  if (rates.includes(requested)) return requested;

  const slowerOrEqual = rates.filter((rate) => rate <= requested);
  if (slowerOrEqual.length) return slowerOrEqual[slowerOrEqual.length - 1];

  return rates[0] || 1;
}

function StableYouTubeDubaiVideo({
  scene,
  poster,
}: {
  scene: YouTubeEnvironmentScene;
  poster: string;
}) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const playerRef = React.useRef<YouTubePlayer | null>(null);
  const monitorRef = React.useRef<number | null>(null);
  const loopTimerRef = React.useRef<number | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [looping, setLooping] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    const clearTimers = () => {
      if (monitorRef.current) window.clearInterval(monitorRef.current);
      if (loopTimerRef.current) window.clearTimeout(loopTimerRef.current);
      monitorRef.current = null;
      loopTimerRef.current = null;
    };

    const applyPlaybackPolicy = (player: YouTubePlayer) => {
      player.mute();
      player.setVolume(0);
      const rate = selectSupportedPlaybackRate(player, scene.playbackRate);
      player.setPlaybackRate(rate);
    };

    const loopSegment = (player: YouTubePlayer) => {
      if (loopTimerRef.current) return;
      setLooping(true);

      loopTimerRef.current = window.setTimeout(() => {
        player.seekTo(scene.startAt, true);
        applyPlaybackPolicy(player);
        player.playVideo();

        window.setTimeout(() => {
          setLooping(false);
          loopTimerRef.current = null;
        }, 360);
      }, 420);
    };

    void loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !hostRef.current) return;

        const player = new YT.Player(hostRef.current, {
          width: '3840',
          height: '2160',
          videoId: scene.videoId,
          playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
            mute: 1,
            start: scene.startAt,
            end: scene.endAt,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              if (cancelled) return;
              playerRef.current = event.target;
              applyPlaybackPolicy(event.target);
              event.target.seekTo(scene.startAt, true);
              event.target.playVideo();
              setLoaded(true);

              monitorRef.current = window.setInterval(() => {
                const current = event.target.getCurrentTime();
                if (Number.isFinite(current) && current >= scene.endAt - 0.28) {
                  loopSegment(event.target);
                }
              }, 250);
            },
            onStateChange: (event) => {
              if (cancelled) return;
              if (event.data === YT.PlayerState.ENDED) loopSegment(event.target);
            },
            onError: () => {
              if (!cancelled) setFailed(true);
            },
          },
        });

        playerRef.current = player;
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      clearTimers();
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [scene.endAt, scene.playbackRate, scene.startAt, scene.videoId]);

  if (failed) return null;

  return (
    <div
      className={`environment-youtube ${loaded ? 'is-loaded' : ''} ${looping ? 'is-looping' : ''}`}
      style={{ backgroundImage: `url("${poster}")` }}
      aria-hidden="true"
    >
      <div ref={hostRef} className="environment-youtube__player-host" />
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
  const youtubeScene = youtubeEnvironmentScene(phase);

  return (
    <div
      className={`environment-world environment-world--${phase} ${outgoing ? 'is-outgoing' : 'is-active'}`}
      style={{ backgroundImage: `url("${poster}")` }}
      aria-hidden="true"
    >
      {mode === 'youtube' && (
        <StableYouTubeDubaiVideo
          scene={youtubeScene}
          poster={poster}
        />
      )}

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
