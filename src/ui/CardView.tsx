// <CardView card size="mini|board|zoom" /> and <CardBack /> (SPEC §9.1). Aspect ratio 5:7.
import { memo, type ReactNode } from 'react';
import type { Card } from '../engine';
import artIds from './artManifest.json';
import { ProceduralArt } from './CardArt';
import { cardTint } from './cardArtMap';
import { Cog, Skull, Urn } from './icons';

const HAS_ART = new Set<string>(artIds as string[]);

const KEYWORDS = /(Earth Health|EH [+-−]?\d+|EH|LP|Influence|Sabotages?|Salvage|Gather|Contributes?|Contributors?|Infected|Blight Cubes?|Embargoed|Embargo|Exiled|Silenced|Paralyzed|Crucible|Urn vote|Aye|Nay|Tie)/g;

/** Bolds rules keywords (EH, LP, Influence, Sabotage, Infected, ...). */
export function withKeywords(text: string): ReactNode[] {
  return text.split(KEYWORDS).map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part));
}

export function ehBadge(card: Card): string | null {
  const { op, value, timing } = card.eh;
  if (op === 'end') return 'END';
  if (op === 'set') return timing === 'tie' ? `TIE: EH → ${value}` : `EH → ${value}`;
  if (op === 'none' || value === 0) return null;
  const n = `${value > 0 ? '+' : '−'}${Math.abs(value)}`;
  if (timing === 'tie') return `TIE ${n}`;
  return `EH ${n}`;
}

export function mitigationBadge(card: Card): { icon: ReactNode; text: string } | null {
  const m = card.mitigation;
  switch (m.kind) {
    case 'pool_influence': return { icon: <Cog size={12} />, text: `POOL ${m.amount}` };
    case 'pool_lp': return { icon: <Skull size={12} />, text: `SACRIFICE ${m.amount} LP` };
    case 'volunteer_lp': return { icon: <Skull size={12} />, text: `VOLUNTEER ${m.amount} LP` };
    case 'urn_vote': return { icon: <Urn size={12} />, text: 'URN VOTE' };
    case 'open_vote': return { icon: <Urn size={12} />, text: 'OPEN VOTE' };
    case 'blind_bid': return { icon: <Cog size={12} />, text: 'BLIND BID' };
    case 'personal_choice': return { icon: <Skull size={12} />, text: 'CHOICE' };
    case 'influence_auction': return { icon: <Cog size={12} />, text: 'LOWEST PAYS' };
    default: return null;
  }
}

interface Props {
  card: Card;
  size?: 'mini' | 'board' | 'zoom';
  onClick?: () => void;
}

export const CardView = memo(function CardView({ card, size = 'board', onClick }: Props) {
  const tint = cardTint(card);
  const eh = ehBadge(card);
  const mit = mitigationBadge(card);
  // The short text goes on the card; the full digital ruling is shown in a panel under the zoomed card.
  const text = card.shortText ?? card.digitalRuling;
  const body = (
    <>
      <div className="card-header">{tint.label}</div>
      <div className="card-title">{card.title}</div>
      <div className="card-art">
        {HAS_ART.has(card.id)
          ? <img src={`${import.meta.env.BASE_URL}art/cards/${card.id}.webp`} alt="" loading="lazy" decoding="async" />
          : <ProceduralArt card={card} />}
      </div>
      {size !== 'mini' && (
        <>
          <div className="card-badges">
            {eh && <span className="badge badge-eh"><Skull size={12} />{eh}</span>}
            {mit && <span className="badge badge-mit">{mit.icon}{mit.text}</span>}
          </div>
          <div className="card-text">{withKeywords(text)}</div>
          {size === 'zoom' && card.flavor && <div className="card-flavor">{card.flavor}</div>}
          <div className="card-id">{card.id}</div>
        </>
      )}
    </>
  );
  const style = { '--frame': tint.frame } as React.CSSProperties;
  const cls = `card card-${size} deck-${card.deck}${card.expansion ? ' deck-schism' : ''}${card.stage === 4 ? ' stage-4' : ''}`;
  return onClick
    ? <button type="button" className={cls} style={style} onClick={onClick} aria-label={`${card.title}. ${card.shortText ?? ''} Tap to enlarge.`}>{body}</button>
    : <div className={cls} style={style}>{body}</div>;
});

export function CardBack({ size = 'board', label }: { size?: 'mini' | 'board' | 'zoom'; label?: string }) {
  return (
    <div className={`card card-${size} card-back`} role="img" aria-label={label ?? 'Face-down card'}>
      <svg viewBox="0 0 100 100" className="card-back-gear" aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => <rect key={i} x="46" y="6" width="8" height="14" transform={`rotate(${i * 30} 50 50)`} />)}
        <circle cx="50" cy="50" r="32" fill="none" strokeWidth="7" />
        <circle cx="50" cy="50" r="9" />
      </svg>
      <div className="card-back-mark">ZERO<br />COUNCIL</div>
      {label && <div className="card-back-label">{label}</div>}
    </div>
  );
}
