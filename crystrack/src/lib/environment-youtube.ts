import type { TimePhase } from '@/lib/theme';

export interface YouTubeEnvironmentScene {
  videoId: string;
  startAt: number;
  label: string;
}

export const YOUTUBE_ENVIRONMENT_SCENES: Record<TimePhase, YouTubeEnvironmentScene> = {
  morning: {
    videoId: 'AjwcqYZ6cIw',
    startAt: 0,
    label: 'Dubai daylight',
  },
  day: {
    videoId: 'AjwcqYZ6cIw',
    startAt: 0,
    label: 'Dubai daylight',
  },
  golden: {
    videoId: 'i9hsP_dLIaM',
    startAt: 0,
    label: 'Dubai sunset',
  },
  evening: {
    videoId: 'i9hsP_dLIaM',
    startAt: 0,
    label: 'Dubai sunset',
  },
  night: {
    videoId: 'vJKEcp3BAVw',
    startAt: 30,
    label: 'Dubai night',
  },
};

export function youtubeEnvironmentScene(phase: TimePhase) {
  return YOUTUBE_ENVIRONMENT_SCENES[phase];
}

export function youtubeEnvironmentEmbedUrl(scene: YouTubeEnvironmentScene) {
  const params = new URLSearchParams({
    autoplay: '1',
    mute: '1',
    controls: '0',
    loop: '1',
    playlist: scene.videoId,
    playsinline: '1',
    rel: '0',
    modestbranding: '1',
    disablekb: '1',
    fs: '0',
    iv_load_policy: '3',
    cc_load_policy: '0',
    start: String(scene.startAt),
  });

  return `https://www.youtube-nocookie.com/embed/${scene.videoId}?${params.toString()}`;
}
