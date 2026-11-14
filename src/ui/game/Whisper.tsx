// The Whisper Campaign overlay (SPEC §4, §7.1 screen 4): a timed deal board.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  abilitiesActive, canTrade, getHandler, type Deal, type DealTerm, type GameState, type Seat,
} from '../../engine';
import { Sheet, Stepper } from '../common';
import { Seal } from '../icons';
import { FACTION_SHORT, useGameStore } from '../../store/gameStore';
import { describe, termText } from '../text';
import { play } from '../../audio/sfx';

type Template = 'pact' | 'buyPeace' | 'sellPeace' | 'hit' | 'vote' | 'buyLP' | 'sellCure' | 'buyCure';

const TEMPLATE_LABEL: Record<Template, string> = {
  pact: 'We both Contribute',
  buyPeace: 'I pay you not to Sabotage me',
  sellPeace: 'You pay me not to Sabotage you',
  hit: 'We both Sabotage a rival',
  vote: 'We vote the same way',
  buyLP: 'I pay to see your LP',
  sellCure: 'I Inoculate you, for a price',
  buyCure: 'You Inoculate me, for a price',
};

function buildTerms(tpl: Template, me: Seat, r: Seat, n: number, target: Seat | 'aye' | 'nay' | undefined): DealTerm[] | null {
  switch (tpl) {
    case 'pact': return [{ kind: 'willContribute', who: me, min: n }, { kind: 'willContribute', who: r, min: n }];
    case 'buyPeace': return [{ kind: 'giveInfluenceNow', from: me, amount: n }, { kind: 'willNotSabotage', who: r, target: me }];
    case 'sellPeace': return [{ kind: 'giveInfluenceNow', from: r, amount: n }, { kind: 'willNotSabotage', who: me, target: r }];
    case 'buyLP': return [{ kind: 'giveInfluenceNow', from: me, amount: n }, { kind: 'revealLP', who: r }];
    case 'sellCure': return [{ kind: 'giveInfluenceNow', from: r, amount: n }, { kind: 'willInoculate', who: me, target: r }];
    case 'buyCure': return [{ kind: 'giveInfluenceNow', from: me, amount: n }, { kind: 'willInoculate', who: r, target: me }];
    case 'hit':
      return typeof target === 'number' ? [{ kind: 'willSabotage', who: me, target }, { kind: 'willSabotage', who: r, target }] : null;
    case 'vote':
      return target !== undefined ? [{ kind: 'willVote', who: me, target }, { kind: 'willVote', who: r, target }] : null;
  }
}

/** The vote deals can be made over this turn: 'seat', 'ayeNay' or none. */
function voteKind(g: GameState): 'seat' | 'ayeNay' | null {
  for (const id of [g.crisis && !g.crisis.faceDown ? g.crisis.cardId : null, g.mandate?.cardId ?? null]) {
    if (!id) continue;
    const h = getHandler(id);
    if (h.silentVote) continue;
    if (h.vote === 'ayeNay') return 'ayeNay';
    if (h.vote === 'target' || h.vote === 'twoTargets' || h.vote === 'open' || h.vote === 'unanimous') return 'seat';
  }
  return null;
}

function Note({ g, deal, me, children }: { g: GameState; deal: Deal; me: Seat; children?: React.ReactNode }) {
  const lineText = useGameStore((s) => s.dealLines[deal.id]);
  const other = deal.proposer === me ? deal.partner : deal.proposer;
  const stamp = { accepted: 'SEALED', rejected: 'REFUSED', expired: 'EXPIRED', kept: 'KEPT', broken: 'BETRAYED', voided: 'VOID', offered: '' }[deal.status];
  return (
    <li className={`note note-${deal.status}${deal.binding ? ' note-bound' : ''}`}>
      <div className="note-from">
        {deal.proposer === me ? `Your offer to the ${FACTION_SHORT[g.players[other]!.factionId]}` : `From the ${FACTION_SHORT[g.players[other]!.factionId]}`}
        {deal.binding && <span className="bound"><Seal size={12} /> Binding Oath</span>}
      </div>
      {lineText && <p className="note-line">“{lineText}”</p>}
      <ul className="terms">{deal.terms.map((t, i) => <li key={i}>{termText(g, t, me)}</li>)}</ul>
      {stamp && <span className="stamp">{stamp}</span>}
      {children}
    </li>
  );
}

interface Props {
  g: GameState;
  me: Seat;
  onHide: () => void;
}

export function WhisperSheet({ g, me, onHide }: Props) {
  const s = useGameStore();
  const p = g.players[me]!;
  const [now, setNow] = useState(Date.now());
  const [builder, setBuilder] = useState(false);
  const [ability, setAbility] = useState<null | 'ventSector' | 'inoculate' | 'subpoena'>(null);
  const [counter, setCounter] = useState<{ deal: Deal; delta: number } | null>(null);
  const endsAt = g.whisper?.endsAt ?? now;
  const total = g.config.whisperSeconds * 1000;
  const left = Math.max(0, endsAt - now);
  const hiddenAt = useRef<number | null>(null);

  // Wall-clock timer: it never pauses, and the AIs act while it runs.
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 250);
    const pace = Math.max(1500, Math.min(5000, total / 9));
    const act = window.setInterval(() => useGameStore.getState().whisperAct(), s.settings.fast ? pace / 2 : pace);
    const first = window.setTimeout(() => useGameStore.getState().whisperAct(), 700);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(act);
      window.clearTimeout(first);
    };
  }, [total, s.settings.fast]);
  useEffect(() => {
    if (left <= 0 && g.step === 'whisper') s.sealCouncil();
  }, [left <= 0]); // eslint-disable-line react-hooks/exhaustive-deps
  // The Bathroom Break Rule.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) hiddenAt.current = Date.now();
      else if (hiddenAt.current !== null) {
        useGameStore.getState().reportAbsence((Date.now() - hiddenAt.current) / 1000);
        hiddenAt.current = null;
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const mine = g.deals.filter((d) => d.turn === g.turn && (d.proposer === me || d.partner === me));
  const incoming = mine.filter((d) => d.partner === me && d.status === 'offered');
  const rest = mine.filter((d) => !(d.partner === me && d.status === 'offered')).reverse();
  const sent = mine.filter((d) => d.proposer === me).length;
  const tradeable = canTrade(g, me);
  const rivals = g.players.filter((x) => x.seat !== me && !x.eliminated);
  const active = abilitiesActive(g, me);
  const rumors = useMemo(() => s.log.filter((l) => l.turn === g.turn).map((l) => ({ n: l.n, line: describe(l.event, g, me), type: l.event.type }))
    .filter((x) => x.line && ['DealProposed', 'AbilityUsed', 'LPRevealed', 'AbsencePunished', 'StatusApplied', 'InfluenceChanged'].includes(x.type)).slice(-6).reverse(), [s.log, g, me]);

  const abilityButton = (id: 'ventSector' | 'inoculate' | 'subpoena', label: string, ok: boolean, why: string) => (
    <button type="button" className="btn btn-ability" disabled={!active || p.abilityUsedThisTurn || !ok} onClick={() => setAbility(id)}
      title={!active ? 'Your abilities are locked' : p.abilityUsedThisTurn ? 'Already used this turn' : ok ? '' : why}>
      {label}{(!active || p.abilityUsedThisTurn || !ok) && <small>{!active ? 'locked' : p.abilityUsedThisTurn ? 'used' : why}</small>}
    </button>
  );
  const pct = total > 0 ? left / total : 0;
  const secs = Math.ceil(left / 1000);
  // A heartbeat for each of the last ten seconds.
  useEffect(() => {
    if (secs <= 10 && secs > 0) play('heartbeat');
  }, [secs]);

  return (
    <Sheet title="Whisper Campaign" tall onClose={onHide} className="whisper-panel">
      <div className="whisper-top">
        <svg className={`timer${secs <= 10 ? ' urgent' : ''}`} viewBox="0 0 44 44" role="timer" aria-label={`${secs} seconds left`}>
          <circle cx="22" cy="22" r="19" className="timer-track" />
          <circle cx="22" cy="22" r="19" className="timer-arc" strokeDasharray={119.4} strokeDashoffset={119.4 * (1 - pct)} transform="rotate(-90 22 22)" />
          <text x="22" y="27" textAnchor="middle">{secs}</text>
        </svg>
        <button type="button" className="btn btn-primary seal-council" onClick={() => s.sealCouncil()}>Seal the Council</button>
      </div>

      {!tradeable && <p className="warn">You are Silenced: you cannot send, receive or accept deals this turn.</p>}

      {(p.factionId === 'scrubbers' || p.factionId === 'wardens' || p.factionId === 'directorate') && (
        <div className="abilities">
          {p.factionId === 'scrubbers' && abilityButton('ventSector', 'Vent the Sector (4)', p.influence >= 4, 'needs 4 Influence')}
          {p.factionId === 'wardens' && abilityButton('inoculate', 'Inoculate (2 LP)', p.lp >= 2, 'needs 2 LP')}
          {p.factionId === 'directorate' && abilityButton('subpoena', 'Subpoena', true, '')}
        </div>
      )}

      <h3>Notes for you {incoming.length > 0 && <span className="count">{incoming.length}</span>}</h3>
      {incoming.length === 0 ? <p className="dim">No offers yet. The Council murmurs.</p> : (
        <ul className="notes">
          {incoming.map((d) => {
            const numeric = d.terms.findIndex((t) => t.kind === 'giveInfluenceNow' || t.kind === 'willContribute');
            return (
              <Note key={d.id} g={g} deal={d} me={me}>
                <div className="note-actions">
                  <button type="button" className="btn btn-primary" onClick={() => s.respondDeal(d.id, true)}>Accept</button>
                  <button type="button" className="btn" onClick={() => s.respondDeal(d.id, false)}>Reject</button>
                  {numeric >= 0 && sent < 3 && <button type="button" className="btn" onClick={() => setCounter({ deal: d, delta: 0 })}>Counter</button>}
                </div>
              </Note>
            );
          })}
        </ul>
      )}

      <button type="button" className="btn wide" disabled={!tradeable || sent >= 3 || rivals.length === 0} onClick={() => setBuilder(true)}>
        + Whisper an offer <small>({3 - sent} left)</small>
      </button>

      {rest.length > 0 && (
        <>
          <h3>This turn's deals</h3>
          <ul className="notes">
            {rest.map((d) => (
              <Note key={d.id} g={g} deal={d} me={me}>
                {d.status === 'accepted' && !d.binding && p.factionId === 'choir' && active && !p.oathUsedThisTurn && (
                  <div className="note-actions">
                    <button type="button" className="btn" onClick={() => s.dispatch({ type: 'UseAbility', seat: me, ability: 'bindingOath', dealId: d.id })}>
                      <Seal size={14} /> Bind with an Oath
                    </button>
                  </div>
                )}
              </Note>
            ))}
          </ul>
        </>
      )}

      <h3>Rumors</h3>
      {rumors.length === 0 ? <p className="dim">Silence, for now.</p> : <ul className="rumors">{rumors.map((r) => <li key={r.n} className={`tone-${r.line!.tone}`}>{r.line!.text}</li>)}</ul>}

      {builder && <OfferBuilder g={g} me={me} onClose={() => setBuilder(false)} />}
      {ability && (
        <Sheet title={{ ventSector: 'Vent the Sector', inoculate: 'Inoculate', subpoena: 'Subpoena' }[ability]} kind="modal" onClose={() => setAbility(null)}>
          <p>{{ ventSector: 'Spend 4 Influence. The rival pays you 2 Influence or is Embargoed this turn.', inoculate: 'Spend 2 LP to remove every Blight Cube from one player.', subpoena: 'Reveal one rival\'s exact LP to the whole Council.' }[ability]}</p>
          <div className="choices">
            {(ability === 'inoculate' ? g.players.filter((x) => !x.eliminated) : rivals).map((r) => (
              <button key={r.seat} type="button" className="btn" onClick={() => { s.dispatch({ type: 'UseAbility', seat: me, ability, target: r.seat }); setAbility(null); }}>
                {r.seat === me ? 'Yourself' : FACTION_SHORT[r.factionId]}{ability === 'inoculate' && <small>{r.blight.bio + r.blight.neuro} cubes</small>}
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {counter && (() => {
        const i = counter.deal.terms.findIndex((t) => t.kind === 'giveInfluenceNow' || t.kind === 'willContribute');
        const t = counter.deal.terms[i]!;
        const base = t.kind === 'giveInfluenceNow' ? t.amount : t.kind === 'willContribute' ? t.min : 1;
        const value = Math.max(1, base + counter.delta);
        const send = () => {
          const terms = counter.deal.terms.map((x) => (x.kind === 'giveInfluenceNow' ? { ...x, amount: value } : x.kind === 'willContribute' ? { ...x, min: value } : x));
          s.respondDeal(counter.deal.id, false);
          s.proposeDeal(counter.deal.proposer, terms);
          setCounter(null);
        };
        return (
          <Sheet title="Counter-offer" kind="modal" onClose={() => setCounter(null)}>
            <p>Change the amount and send it back. This uses one of your offers.</p>
            <Stepper label="Amount" value={value} min={1} max={base + 3} onChange={(v) => setCounter({ deal: counter.deal, delta: v - base })} />
            <button type="button" className="btn btn-primary wide" onClick={send}>Send counter</button>
          </Sheet>
        );
      })()}
    </Sheet>
  );
}

function OfferBuilder({ g, me, onClose }: { g: GameState; me: Seat; onClose: () => void }) {
  const proposeDeal = useGameStore((s) => s.proposeDeal);
  const p = g.players[me]!;
  const partners = g.players.filter((x) => x.seat !== me && !x.eliminated && canTrade(g, x.seat));
  const [partner, setPartner] = useState<Seat | null>(partners[0]?.seat ?? null);
  const [tpl, setTpl] = useState<Template>('pact');
  const [n, setN] = useState(2);
  const [target, setTarget] = useState<Seat | 'aye' | 'nay' | undefined>(undefined);
  const [result, setResult] = useState<Deal | null>(null);
  const lineText = useGameStore((s) => (result ? s.dealLines[result.id] : undefined));
  const vk = voteKind(g);
  const r = partner !== null ? g.players[partner]! : null;
  const templates: Template[] = ['pact', 'buyPeace', 'sellPeace', 'hit', ...(vk ? ['vote' as const] : []), 'buyLP',
    ...(p.factionId === 'wardens' ? ['sellCure' as const] : []), ...(r?.factionId === 'wardens' ? ['buyCure' as const] : [])];
  const needsAmount = !['hit', 'vote'].includes(tpl);
  const thirdParties = g.players.filter((x) => !x.eliminated && x.seat !== me && x.seat !== partner);
  const terms = partner !== null ? buildTerms(tpl, me, partner, n, target) : null;

  if (result) {
    return (
      <Sheet title={result.status === 'accepted' ? 'Deal sealed' : 'Refused'} kind="modal" onClose={onClose}>
        {lineText && <p className="note-line">“{lineText}”</p>}
        <ul className="terms">{result.terms.map((t, i) => <li key={i}>{termText(g, t, me)}</li>)}</ul>
        <button type="button" className="btn btn-primary wide" onClick={onClose}>Back to the whispers</button>
      </Sheet>
    );
  }
  return (
    <Sheet title="Whisper an offer" kind="modal" onClose={onClose}>
      <div className="field">
        <span className="field-label">To</span>
        <div className="targets">
          {partners.map((x) => (
            <button key={x.seat} type="button" className={partner === x.seat ? 'target on' : 'target'} aria-pressed={partner === x.seat}
              onClick={() => { setPartner(x.seat); setTarget(undefined); if (tpl === 'buyCure') setTpl('pact'); }}>{FACTION_SHORT[x.factionId]}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="tpl">Offer</label>
        <select id="tpl" value={templates.includes(tpl) ? tpl : 'pact'} onChange={(e) => { setTpl(e.target.value as Template); setTarget(undefined); }}>
          {templates.map((t) => <option key={t} value={t}>{TEMPLATE_LABEL[t]}</option>)}
        </select>
      </div>
      {needsAmount && <Stepper label="Amount" value={n} min={1} max={9} onChange={setN} unit="Influence" />}
      {tpl === 'hit' && (
        <div className="targets" role="radiogroup" aria-label="Rival to Sabotage">
          {thirdParties.map((x) => <button key={x.seat} type="button" role="radio" aria-checked={target === x.seat} className={target === x.seat ? 'target on' : 'target'} onClick={() => setTarget(x.seat)}>{FACTION_SHORT[x.factionId]}</button>)}
        </div>
      )}
      {tpl === 'vote' && (
        <div className="targets" role="radiogroup" aria-label="Vote">
          {vk === 'ayeNay'
            ? (['aye', 'nay'] as const).map((x) => <button key={x} type="button" role="radio" aria-checked={target === x} className={target === x ? 'target on' : 'target'} onClick={() => setTarget(x)}>{x.toUpperCase()}</button>)
            : thirdParties.map((x) => <button key={x.seat} type="button" role="radio" aria-checked={target === x.seat} className={target === x.seat ? 'target on' : 'target'} onClick={() => setTarget(x.seat)}>{FACTION_SHORT[x.factionId]}</button>)}
        </div>
      )}
      {terms && <ul className="terms preview">{terms.map((t, i) => <li key={i}>{termText(g, t, me)}</li>)}</ul>}
      <button type="button" className="btn btn-primary wide" disabled={!terms || partner === null}
        onClick={() => { const d = proposeDeal(partner!, terms!); if (d) setResult(d); else onClose(); }}>Send the note</button>
    </Sheet>
  );
}
