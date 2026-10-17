'use client';

import { useTheme } from '@/components/layout/theme-provider';

/** ON = Light, OFF = Dark. Adaptive remains available in Settings > Appearance. */
export function PhysicalThemeSwitch() {
  const { preference, environment, setPreference } = useTheme();
  const isLight = preference === 'light' ||
    (preference === 'adaptive' &&
      (environment.phase === 'morning' || environment.phase === 'day'));
  const nextPreference = isLight ? 'dark' : 'light';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isLight}
      aria-label="Light mode"
      aria-description={preference === 'adaptive'
        ? 'Adaptive time-of-day appearance is active. Press to select a manual mode; Auto is available in Settings, Appearance.'
        : 'Press to toggle Light and Dark. Adaptive is available in Settings, Appearance.'}
      title={preference === 'adaptive'
        ? 'Adaptive mode · Click for ' + (isLight ? 'Dark' : 'Light') + ' · Change Auto in Settings'
        : 'Switch to ' + (isLight ? 'Dark' : 'Light')}
      data-switch-mode={isLight ? 'on' : 'off'}
      data-switch-auto={preference === 'adaptive' ? 'true' : 'false'}
      onClick={() => void setPreference(nextPreference)}
      className="crys-hw-switch"
    >
      <span className="crys-hw-switch__housing" aria-hidden="true">
        <span className="crys-hw-switch__rocker">
          <span className="crys-hw-switch__side crys-hw-switch__side--on">ON</span>
          <span className="crys-hw-switch__side crys-hw-switch__side--off">OFF</span>
        </span>
        <span className="crys-hw-switch__auto-light" />
      </span>
    </button>
  );
}
