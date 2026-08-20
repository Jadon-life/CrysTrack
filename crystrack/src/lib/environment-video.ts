import type { TimePhase } from '@/lib/theme';

export interface DubaiVideoScene {
  src: string;
  startAt: number;
  objectPosition?: string;
}

const ROOT = '/backgrounds/dubai-video';

export const DUBAI_VIDEO_SCENES: Record<TimePhase, readonly DubaiVideoScene[]> = {
  morning: [
    { src: `${ROOT}/morning-burj-al-arab.mp4`, startAt: 1.2, objectPosition: '50% 50%' },
    { src: `${ROOT}/morning-aura.mp4`, startAt: 0.8, objectPosition: '50% 47%' },
    { src: `${ROOT}/morning-downtown.mp4`, startAt: 2.0, objectPosition: '50% 50%' },
  ],
  day: [
    { src: `${ROOT}/morning-downtown.mp4`, startAt: 4.1, objectPosition: '50% 50%' },
    { src: `${ROOT}/morning-aura.mp4`, startAt: 3.0, objectPosition: '50% 48%' },
    { src: `${ROOT}/day-palm-aura.mp4`, startAt: 1.5, objectPosition: '50% 50%' },
  ],
  golden: [
    { src: `${ROOT}/golden-skyline.mp4`, startAt: 2.0, objectPosition: '50% 52%' },
    { src: `${ROOT}/golden-drive.mp4`, startAt: 1.1, objectPosition: '50% 50%' },
    { src: `${ROOT}/golden-city.mp4`, startAt: 2.4, objectPosition: '50% 50%' },
  ],
  evening: [
    { src: `${ROOT}/golden-city.mp4`, startAt: 4.3, objectPosition: '50% 50%' },
    { src: `${ROOT}/golden-drive.mp4`, startAt: 3.5, objectPosition: '50% 50%' },
    { src: `${ROOT}/night-fountain.mp4`, startAt: 1.4, objectPosition: '50% 48%' },
  ],
  night: [
    { src: `${ROOT}/night-fountain.mp4`, startAt: 3.0, objectPosition: '50% 48%' },
    { src: `${ROOT}/night-burj.mp4`, startAt: 2.2, objectPosition: '50% 48%' },
    { src: `${ROOT}/night-aerial.mp4`, startAt: 4.5, objectPosition: '50% 48%' },
  ],
};

export function dubaiVideoPoster(phase: TimePhase) {
  return `${ROOT}/posters/${phase}.jpg`;
}

export function dubaiVideoScenesForPanels(phase: TimePhase, panelCount: 1 | 2 | 3) {
  const scenes = DUBAI_VIDEO_SCENES[phase];
  if (panelCount === 1) return [scenes[1]];
  if (panelCount === 2) return [scenes[0], scenes[2]];
  return [...scenes];
}
