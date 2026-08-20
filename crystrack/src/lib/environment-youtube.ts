import type { TimePhase } from '@/lib/theme';

export interface YouTubeEnvironmentScene {
  videoId: string;
  startAt: number;
  endAt: number;
  playbackRate: number;
  label: string;
}

/**
 * These are deliberately short, slowed background windows rather than
 * unrestricted source playback. The first source is a walking-tour video, so
 * it receives the strongest motion reduction.
 */
export const YOUTUBE_ENVIRONMENT_SCENES: Record<TimePhase, YouTubeEnvironmentScene> = {
  morning: {
    videoId: 'AjwcqYZ6cIw',
    startAt: 0,
    endAt: 15,
    playbackRate: 0.25,
    label: 'Dubai daylight',
  },
  day: {
    videoId: 'AjwcqYZ6cIw',
    startAt: 0,
    endAt: 15,
    playbackRate: 0.25,
    label: 'Dubai daylight',
  },
  golden: {
    videoId: 'i9hsP_dLIaM',
    startAt: 0,
    endAt: 24,
    playbackRate: 0.5,
    label: 'Dubai sunset',
  },
  evening: {
    videoId: 'i9hsP_dLIaM',
    startAt: 0,
    endAt: 24,
    playbackRate: 0.5,
    label: 'Dubai sunset',
  },
  night: {
    videoId: 'vJKEcp3BAVw',
    startAt: 30,
    endAt: 54,
    playbackRate: 0.5,
    label: 'Dubai night',
  },
};

export function youtubeEnvironmentScene(phase: TimePhase) {
  return YOUTUBE_ENVIRONMENT_SCENES[phase];
}
