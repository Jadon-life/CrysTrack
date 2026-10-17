'use client';
import { useEffect, useRef, useState } from 'react';
export function GoalDock({
  onCreate,
  onCheckIn,
  hasCheckIn,
}: {
  onCreate: () => void;
  onCheckIn: () => void;
  hasCheckIn: boolean;
}) {
  const [seconds, setSeconds] = useState(1500),
    [running, setRunning] = useState(false);
  const end = useRef(0);
  const remaining = useRef(seconds);
  useEffect(() => {
    remaining.current = seconds;
  }, [seconds]);
  useEffect(() => {
    if (!running) return;
    end.current = performance.now() + remaining.current * 1000;
    const timer = setInterval(() => {
      const left = Math.max(
        0,
        Math.ceil((end.current - performance.now()) / 1000),
      );
      setSeconds(left);
      if (!left) setRunning(false);
    }, 250);
    return () => clearInterval(timer);
  }, [running]); // Remaining duration is captured when the timer starts.
  return (
    <aside className="goal-dock" aria-label="Goal quick actions">
      <button onClick={onCreate}>New goal</button>
      <button disabled={!hasCheckIn} onClick={onCheckIn}>
        Check in
      </button>
      <button
        aria-label={running ? 'Pause focus timer' : 'Start focus timer'}
        onClick={() => setRunning(!running)}
        disabled={!seconds}
      >
        {String(Math.floor(seconds / 60)).padStart(2, '0')}:
        {String(seconds % 60).padStart(2, '0')} · {running ? 'Pause' : 'Focus'}
      </button>
      <button
        aria-label="Reset focus timer"
        onClick={() => {
          setRunning(false);
          setSeconds(1500);
        }}
      >
        ↻
      </button>
      {!seconds && <span role="status">A good moment to rest.</span>}
    </aside>
  );
}
