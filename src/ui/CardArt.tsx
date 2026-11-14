// Procedural card illustrations (SPEC §9.2): etched, woodcut-like motifs over a stage-tinted ground.
import { memo, type ReactNode } from 'react';
import type { Card } from '../engine';
import { CARD_MOTIFS, cardTint, type Motif } from './cardArtMap';

/** Each motif is drawn in a 100 x 100 box, stroked in the current ink colour. */
const MOTIFS: Record<Motif, ReactNode> = {
  gear: (
    <g>
      {Array.from({ length: 10 }, (_, i) => (
        <rect key={i} x="45" y="6" width="10" height="16" transform={`rotate(${i * 36} 50 50)`} fill="currentColor" stroke="none" />
      ))}
      <circle cx="50" cy="50" r="31" />
      <circle cx="50" cy="50" r="12" />
      <path d="M50 19v19M50 62v19M19 50h19M62 50h19" />
    </g>
  ),
  skull: (
    <g>
      <path d="M50 12c-21 0-34 14-34 31 0 11 5 18 12 23v12h44V66c7-5 12-12 12-23 0-17-13-31-34-31z" />
      <ellipse cx="37" cy="45" rx="8" ry="10" fill="currentColor" stroke="none" />
      <ellipse cx="63" cy="45" rx="8" ry="10" fill="currentColor" stroke="none" />
      <path d="M50 54l-5 11h10z" fill="currentColor" stroke="none" />
      <path d="M36 78v10M45 78v11M55 78v11M64 78v10" />
    </g>
  ),
  valve: (
    <g>
      <circle cx="50" cy="42" r="28" />
      <circle cx="50" cy="42" r="7" fill="currentColor" stroke="none" />
      <path d="M50 14v56M22 42h56M30 22l40 40M70 22L30 62" />
      <path d="M38 70h24v10H38zM10 80h80v10H10z" />
    </g>
  ),
  biohazard: (
    <g>
      <circle cx="50" cy="50" r="8" fill="currentColor" stroke="none" />
      {[0, 120, 240].map((a) => (
        <g key={a} transform={`rotate(${a} 50 50)`}>
          <path d="M50 42c-14-6-18-22-10-32 3 12 10 14 10 14s7-2 10-14c8 10 4 26-10 32z" />
        </g>
      ))}
      <circle cx="50" cy="50" r="20" />
    </g>
  ),
  radio: (
    <g>
      <rect x="14" y="40" width="72" height="44" rx="4" />
      <circle cx="36" cy="62" r="13" />
      <path d="M30 56l12 12M30 68l12-12M58 52h20M58 60h20M58 68h20M58 76h12" />
      <path d="M70 40L52 10" />
      <path d="M40 22c6-8 18-8 24 0M33 16c10-13 28-13 38 0" />
    </g>
  ),
  urn: (
    <g>
      <path d="M32 16h36M36 16c-3 10-22 22-22 46 0 18 12 24 20 28h32c8-4 20-10 20-28 0-24-19-36-22-46" />
      <path d="M34 90h32v6H34zM20 52h60" />
      <path d="M50 28l8 14H42z" fill="currentColor" stroke="none" />
      <path d="M44 66h12M40 74h20" />
    </g>
  ),
  padlock: (
    <g>
      <path d="M30 46V32c0-12 8-20 20-20s20 8 20 20v14" />
      <rect x="20" y="46" width="60" height="44" rx="4" />
      <circle cx="50" cy="64" r="6" fill="currentColor" stroke="none" />
      <path d="M50 66v12" strokeWidth="5" />
      <path d="M8 58l12 4M92 58l-12 4" />
    </g>
  ),
  crack: (
    <g>
      <path d="M48 4l8 20-14 12 16 16-12 14 14 14-10 16" strokeWidth="4" />
      <path d="M42 36L22 44l-10-6M58 52l22-4 10 8M46 66l-18 12M60 80l16 6" />
    </g>
  ),
  eye: (
    <g>
      <path d="M6 50c14-22 30-30 44-30s30 8 44 30c-14 22-30 30-44 30S20 72 6 50z" />
      <circle cx="50" cy="50" r="17" />
      <circle cx="50" cy="50" r="7" fill="currentColor" stroke="none" />
      <path d="M50 6v8M26 12l4 7M74 12l-4 7M50 86v8M26 88l4-7M74 88l-4-7" />
    </g>
  ),
  hand: (
    <g>
      <path d="M30 92V56l-10-18c-2-5 5-9 8-4l8 12V18c0-7 9-7 9 0v24-30c0-7 9-7 9 0v30-24c0-7 9-7 9 0v26-16c0-7 9-7 9 0v40c0 14-6 22-10 26z" />
      <path d="M40 60c8 4 20 4 28 0" />
    </g>
  ),
  clock: (
    <g>
      <circle cx="50" cy="50" r="38" />
      <circle cx="50" cy="50" r="31" />
      {Array.from({ length: 12 }, (_, i) => (
        <path key={i} d="M50 14v7" transform={`rotate(${i * 30} 50 50)`} />
      ))}
      <path d="M50 50V24M50 50l18 10" strokeWidth="4" />
      <circle cx="50" cy="50" r="4" fill="currentColor" stroke="none" />
    </g>
  ),
  flare: (
    <g>
      <circle cx="50" cy="44" r="13" fill="currentColor" stroke="none" />
      {Array.from({ length: 12 }, (_, i) => (
        <path key={i} d={i % 2 ? 'M50 24V12' : 'M50 22V2'} transform={`rotate(${i * 30} 50 44)`} />
      ))}
      <path d="M50 58c-4 12 4 16 0 34M38 64c-6 10 2 14-4 26M62 64c6 10-2 14 4 26" />
    </g>
  ),
  tunnel: (
    <g>
      <path d="M6 94V40C6 18 26 6 50 6s44 12 44 34v54" />
      <path d="M22 94V46c0-14 12-22 28-22s28 8 28 22v48" />
      <path d="M38 94V54c0-7 5-11 12-11s12 4 12 11v40" fill="currentColor" stroke="none" />
      <path d="M6 94h88M6 60l16 4M94 60l-16 4M14 28l14 10M86 28L72 38" />
    </g>
  ),
  monitor: (
    <g>
      <rect x="8" y="14" width="84" height="58" rx="4" />
      <path d="M14 46h18l6-18 8 36 7-26 5 8h28" strokeWidth="3.5" />
      <path d="M40 72v12M60 72v12M28 88h44" />
    </g>
  ),
  scales: (
    <g>
      <path d="M50 10v76M28 90h44M16 26h68" />
      <circle cx="50" cy="12" r="5" fill="currentColor" stroke="none" />
      <path d="M16 26L4 54h24zM84 26L72 60h24z" />
      <path d="M4 54c3 8 21 8 24 0M72 60c3 8 21 8 24 0" />
    </g>
  ),
  noose: (
    <g>
      <path d="M4 12h92M14 12v14h72V12" />
      <path d="M50 26v26" strokeWidth="5" />
      <path d="M44 34h12M44 40h12M44 46h12" />
      <ellipse cx="50" cy="72" rx="14" ry="20" strokeWidth="4" />
      <path d="M26 26v8M74 26v8" />
    </g>
  ),
};

interface ArtProps {
  card: Card;
  className?: string;
}

/** A unique, stable number per card for small layout variations. */
function hash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const ProceduralArt = memo(function ProceduralArt({ card, className }: ArtProps) {
  const tint = cardTint(card);
  const [main, back] = CARD_MOTIFS[card.id] ?? ['gear'];
  const h = hash(card.id);
  const uid = card.id.replace('-', '');
  const side = h % 2 ? 1 : -1;
  const tilt = ((h >> 3) % 9) - 4;
  return (
    <svg className={className} viewBox="0 0 200 126" preserveAspectRatio="xMidYMid slice" role="img" aria-label={`${card.title} illustration`}>
      <defs>
        <radialGradient id={`g${uid}`} cx="50%" cy="38%" r="75%">
          <stop offset="0" stopColor={tint.from} />
          <stop offset="1" stopColor={tint.to} />
        </radialGradient>
        <pattern id={`h${uid}`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform={`rotate(${35 + (h % 30)})`}>
          <path d="M0 0v5" stroke={tint.ink} strokeWidth="0.6" opacity="0.22" />
        </pattern>
        <filter id={`n${uid}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={h % 97} />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0" />
        </filter>
        <linearGradient id={`v${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.85" />
        </linearGradient>
      </defs>
      <rect width="200" height="126" fill={`url(#g${uid})`} />
      <rect width="200" height="126" fill={`url(#h${uid})`} />
      {/* The background motif, large and faint, cropped by the frame. */}
      {back && (
        <g transform={`translate(${side > 0 ? 96 : -22} -6) scale(1.3) rotate(${-tilt * 2} 50 50)`} fill="none" stroke={tint.ink}
          color={tint.ink} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" opacity="0.28">
          {MOTIFS[back]}
        </g>
      )}
      {/* The subject. */}
      <g transform={`translate(${side > 0 ? 34 : 70} 13) rotate(${tilt} 50 50)`} fill="none" stroke={tint.ink} color={tint.ink}
        strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round">
        {MOTIFS[main]}
      </g>
      {/* Drips and vignette. */}
      {Array.from({ length: 6 }, (_, i) => {
        const x = 12 + ((h >> i) % 29) + i * 31;
        const len = 10 + ((h >> (i + 5)) % 22);
        return <path key={i} d={`M${x} 0v${len}`} stroke="#000" strokeWidth={3 + (i % 3)} strokeLinecap="round" opacity="0.55" />;
      })}
      <rect width="200" height="126" fill={`url(#v${uid})`} />
      <rect width="200" height="126" filter={`url(#n${uid})`} opacity="0.5" />
    </svg>
  );
});
