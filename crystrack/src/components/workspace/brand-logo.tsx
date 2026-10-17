'use client';
import Image from 'next/image';
import { useTheme } from '@/components/layout/theme-provider';
import {
  effectiveWorkspaceTheme,
  brandAssetForTheme,
} from '@/lib/workspace/design';
export function ThemeAwareBrandLogo() {
  const { preference, environment } = useTheme(),
    mode = effectiveWorkspaceTheme(preference, environment.phase),
    src = brandAssetForTheme(mode);
  return (
    <span className="workspace-brand" data-brand-mode={mode}>
      {src &&
        (src === '/brand/official-reference.jpg' ? (
          <svg
            className={'workspace-brand-logo workspace-brand-logo--' + mode}
            viewBox={mode === 'light' ? '50 188 214 245' : '970 187 258 254'}
            aria-hidden="true"
            preserveAspectRatio="xMidYMid meet"
          >
            <image href={src} width="1280" height="640" />
          </svg>
        ) : (
          <Image
            unoptimized
            src={src}
            alt=""
            width="32"
            height="32"
            className="workspace-brand-logo"
          />
        ))}
      <span>CrysTrack</span>
    </span>
  );
}
