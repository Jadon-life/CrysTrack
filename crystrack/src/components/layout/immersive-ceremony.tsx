'use client';

import React from 'react';
import { Sparkles, X } from 'lucide-react';
import type { TimePhase } from '@/lib/theme';
import {
  ceremonyBlockForPhase,
  ceremonyWasSeen,
  immersiveIntrosEnabled,
  markCeremonySeen,
  shouldUseLiteCeremony,
  subscribeImmersiveIntroPreference,
  type CeremonyBlock,
} from '@/lib/immersive-experience';

type Stage = 'idle' | 'active' | 'cracked' | 'droplets' | 'cleaning' | 'closing';

function MorningCeremony({
  stage,
  setStage,
  finish,
}: {
  stage: Stage;
  setStage: React.Dispatch<React.SetStateAction<Stage>>;
  finish: () => void;
}) {
  const [hits, setHits] = React.useState(0);

  const hitIce = () => {
    if (stage === 'closing' || stage === 'cleaning' || stage === 'droplets') return;
    const next = hits + 1;
    setHits(next);
    if (next === 1) {
      setStage('cracked');
      return;
    }
    setStage('droplets');
  };

  React.useEffect(() => {
    if (stage !== 'droplets') return;
    const timer = window.setTimeout(finish, 6200);
    return () => window.clearTimeout(timer);
  }, [stage, finish]);

  const clean = () => {
    setStage('cleaning');
    window.setTimeout(finish, 1900);
  };

  const leave = () => {
    setStage('closing');
    window.setTimeout(finish, 1500);
  };

  return (
    <div className={`ceremony-morning ${stage === 'cracked' ? 'is-cracked' : ''} ${stage === 'droplets' ? 'is-shattered' : ''} ${stage === 'cleaning' ? 'is-cleaning' : ''}`}>
      <button type="button" className="ceremony-morning__ice" onClick={hitIce} aria-label="Break the frozen glass">
        <span className="ceremony-morning__frost" />
        <svg className="ceremony-morning__cracks" viewBox="0 0 1000 700" aria-hidden="true">
          <path d="M510 338 L430 270 L360 292 L315 236 M430 270 L405 191 L347 155 M510 338 L580 246 L650 224 L716 153 M580 246 L606 178 L578 122 M510 338 L616 360 L685 424 L760 432 M616 360 L682 330 L744 351 M510 338 L470 427 L403 484 L347 558 M470 427 L501 515 L470 611 M510 338 L401 355 L331 406 L237 414 M401 355 L355 326 L282 337" />
        </svg>
        <span className="ceremony-morning__instruction">
          {hits === 0 ? 'Tap to crack the morning frost' : 'One more tap'}
        </span>
      </button>

      <div className="ceremony-morning__shards" aria-hidden="true">
        {Array.from({ length: 12 }).map((_, index) => <span key={index} style={{ '--i': index } as React.CSSProperties} />)}
      </div>

      <div className="ceremony-droplets" aria-hidden="true">
        {Array.from({ length: 18 }).map((_, index) => <i key={index} style={{ '--i': index } as React.CSSProperties} />)}
      </div>

      {stage === 'droplets' && (
        <div className="ceremony-clean-prompt">
          <div>
            <p className="ceremony-clean-prompt__eyebrow">Morning clarity</p>
            <p className="ceremony-clean-prompt__title">Clean the glass?</p>
            <p className="ceremony-clean-prompt__copy">A little condensation is still resting over your view.</p>
          </div>
          <div className="ceremony-clean-prompt__actions">
            <button type="button" onClick={leave}>Leave it</button>
            <button type="button" className="is-primary" onClick={clean}>Clean view</button>
          </div>
        </div>
      )}

      <div className="ceremony-cloth" aria-hidden="true"><span /></div>
    </div>
  );
}

function EveningCeremony() {
  return (
    <div className="ceremony-evening" aria-hidden="true">
      <div className="ceremony-evening__veil" />
      <div className="ceremony-evening__flare" />
      <div className="ceremony-evening__glass" />
    </div>
  );
}

function NightCeremony() {
  return (
    <div className="ceremony-night" aria-hidden="true">
      <div className="ceremony-night__glass" />
      <div className="ceremony-night__lights">
        {Array.from({ length: 24 }).map((_, index) => <i key={index} style={{ '--i': index } as React.CSSProperties} />)}
      </div>
      <div className="ceremony-night__sweep" />
    </div>
  );
}

export function ImmersiveCeremony({
  phase,
  userKey,
  reducedMotion,
}: {
  phase: TimePhase;
  userKey: string;
  reducedMotion: boolean;
}) {
  const [enabled, setEnabled] = React.useState(true);
  const [block, setBlock] = React.useState<CeremonyBlock | null>(null);
  const [stage, setStage] = React.useState<Stage>('idle');
  const [visible, setVisible] = React.useState(false);
  const finishTimerRef = React.useRef<number | null>(null);

  const finish = React.useCallback(() => {
    if (finishTimerRef.current) window.clearTimeout(finishTimerRef.current);
    setStage('closing');
    finishTimerRef.current = window.setTimeout(() => setVisible(false), 720);
  }, []);

  React.useEffect(() => {
    setEnabled(immersiveIntrosEnabled());
    return subscribeImmersiveIntroPreference(setEnabled);
  }, []);

  React.useEffect(() => {
    if (!enabled) {
      setVisible(false);
      return;
    }

    const nextBlock = ceremonyBlockForPhase(phase);
    if (!nextBlock || ceremonyWasSeen(userKey, nextBlock)) return;

    markCeremonySeen(userKey, nextBlock);
    setBlock(nextBlock);
    setStage('active');
    setVisible(true);

    const lite = shouldUseLiteCeremony(reducedMotion);
    if (lite) {
      finishTimerRef.current = window.setTimeout(() => {
        setStage('closing');
        window.setTimeout(() => setVisible(false), 420);
      }, 1100);
      return;
    }

    if (nextBlock === 'evening') {
      finishTimerRef.current = window.setTimeout(finish, 4200);
    } else if (nextBlock === 'night') {
      finishTimerRef.current = window.setTimeout(finish, 4600);
    }

    return () => {
      if (finishTimerRef.current) window.clearTimeout(finishTimerRef.current);
    };
  }, [enabled, phase, reducedMotion, userKey, finish]);

  if (!visible || !block) return null;

  return (
    <div className={`immersive-ceremony immersive-ceremony--${block} immersive-ceremony--${stage}`} role="dialog" aria-modal="true" aria-label={`${block} CrysTrack entrance`}>
      <button type="button" className="immersive-ceremony__skip" onClick={finish}>
        Skip <X className="w-3.5 h-3.5" />
      </button>

      <div className="immersive-ceremony__signature">
        <Sparkles className="w-4 h-4" />
        <span>CrysTrack</span>
      </div>

      {block === 'morning' && <MorningCeremony stage={stage} setStage={setStage} finish={finish} />}
      {block === 'evening' && <EveningCeremony />}
      {block === 'night' && <NightCeremony />}
    </div>
  );
}
