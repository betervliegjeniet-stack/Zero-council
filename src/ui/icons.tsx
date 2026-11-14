// Small inline icons. All take the current text colour.
import type { SVGProps } from 'react';
import type { FactionId } from '../engine';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = ({ size = 16, ...p }: P) => ({ width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true, ...p });

export const Cog = (p: P) => (
  <svg {...base(p)} fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" strokeLinecap="round" />
  </svg>
);
export const Skull = (p: P) => (
  <svg {...base(p)} fill="currentColor">
    <path d="M12 2C7 2 4 5.5 4 9.6c0 2.6 1.2 4.4 2.9 5.600V18h10.200v-2.800C18.8 14 20 12.2 20 9.6 20 5.5 17 2 12 2zM8.8 12.400a1.9 2.3 0 110-4.6 1.9 2.3 0 010 4.600zm6.4 0a1.9 2.3 0 110-4.6 1.9 2.3 0 010 4.600zM12 12.600l1.2 2.600h-2.400zM8 19h8v3H8z" />
  </svg>
);
export const Cube = (p: P) => (
  <svg {...base(p)} fill="currentColor">
    <path d="M12 2l9 5v10l-9 5-9-5V7z" opacity="0.55" />
    <path d="M12 2l9 5-9 5-9-5z" />
  </svg>
);
export const Lock = (p: P) => (
  <svg {...base(p)} fill="currentColor">
    <path d="M7 10V7a5 5 0 0110 0v3h1.500v11h-13V10zm2 0h6V7a3 3 0 00-6 0z" />
  </svg>
);
export const Urn = (p: P) => (
  <svg {...base(p)} fill="currentColor">
    <path d="M8 3h8v1.500h-1c.500 2 4 4 4 9 0 4-2.5 5.5-4.5 6.500h-5C7.5 19 5 17.5 5 13.500c0-5 3.5-7 4-9H8zM8.5 21h7v1.500h-7z" />
  </svg>
);
export const Mouth = (p: P) => (
  <svg {...base(p)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M3 12c3-4 15-4 18 0-3 4-15 4-18 0zM8 9v6M12 8.500v7M16 9v6" />
  </svg>
);
export const Flip = (p: P) => (
  <svg {...base(p)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <rect x="4" y="5" width="16" height="14" rx="2" />
    <path d="M4 19L20 5" />
  </svg>
);
export const Chevron = (p: P) => (
  <svg {...base(p)} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 5l7 7-7 7" />
  </svg>
);
export const Close = (p: P) => (
  <svg {...base(p)} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M5 5l14 14M19 5L5 19" />
  </svg>
);
export const Seal = (p: P) => (
  <svg {...base(p)} fill="currentColor">
    <path d="M12 2l2.4 2.2 3.2-.400.8 3.1 2.8 1.6-1.2 3 1.2 3-2.8 1.6-.800 3.1-3.2-.400L12 21l-2.4-2.2-3.2.400-.800-3.100L2.8 14.500l1.2-3-1.2-3 2.8-1.6.800-3.1 3.2.400z" />
  </svg>
);

/** Faction sigils, drawn in a 48 box. */
export function Sigil({ faction, size = 32 }: { faction: FactionId; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 48 48', fill: 'none', stroke: 'currentColor', strokeWidth: 2.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  switch (faction) {
    case 'archivists': // an open book shedding ash
      return (
        <svg {...common}>
          <path d="M24 14c-5-4-12-4-18-2v24c6-2 13-2 18 2 5-4 12-4 18-2V12c-6-2-13-2-18 2zM24 14v24" />
          <path d="M12 20h6M12 26h6M30 20h6M30 26h6" />
          <circle cx="16" cy="6" r="1.2" fill="currentColor" /><circle cx="30" cy="4" r="1.2" fill="currentColor" /><circle cx="24" cy="8" r="1.2" fill="currentColor" />
        </svg>
      );
    case 'scrubbers': // a valve wheel
      return (
        <svg {...common}>
          <circle cx="24" cy="24" r="16" /><circle cx="24" cy="24" r="4" fill="currentColor" />
          <path d="M24 8v32M8 24h32M12.7 12.700l22.6 22.600M35.3 12.700L12.7 35.3" />
        </svg>
      );
    case 'choir': // a stitched mouth
      return (
        <svg {...common}>
          <path d="M5 24c7-9 31-9 38 0-7 9-31 9-38 0z" />
          <path d="M13 17v14M19 15.500v17M24 15v18M29 15.500v17M35 17v14" />
        </svg>
      );
    case 'iron': // an iron fist
      return (
        <svg {...common}>
          <path d="M12 22v-8c0-3 5-3 5 0v6-9c0-3 5-3 5 0v9-8c0-3 5-3 5 0v8-5c0-3 5-3 5 0v13c0 6-4 10-8 10h-6c-5 0-9-4-9-9v-9c0-3 3-3 3 0z" />
          <path d="M16 44h16" />
        </svg>
      );
    case 'wardens': // a cracked biohazard
      return (
        <svg {...common}>
          <circle cx="24" cy="24" r="4" fill="currentColor" />
          {[0, 120, 240].map((a) => <path key={a} transform={`rotate(${a} 24 24)`} d="M24 19c-8-3-10-11-6-16 2 6 6 7 6 7s4-1 6-7c4 5 2 13-6 16z" />)}
          <path d="M30 30l5 4-2 5 5 4" />
        </svg>
      );
    default: // the black urn
      return (
        <svg {...common}>
          <path d="M16 8h16M18 8c-1 5-10 9-10 20 0 8 5 11 9 13h14c4-2 9-5 9-13 0-11-9-15-10-20" />
          <path d="M17 41h14v4H17zM10 24h28" />
        </svg>
      );
  }
}
