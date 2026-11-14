// Beliefs (SPEC §5.2): every AI keeps trust, hostility and an LP estimate per rival, updated only
// from what the whole table can see or work out.
import { living, player } from '../selectors';
import type { AIState, GameEvent, GameState, Seat } from '../types';
import { clamp } from './personality';

/**
 * LP changes the whole table can follow: the cause is public and the amount can be worked out
 * (a revealed dial, a printed card effect, visible Blight cubes, revealed bids).
 */
function isTrackable(cause: string): boolean {
  if (['salvage', 'sabotage', 'cannibalism', 'contributeReward', 'blight', 'crucibleBid', 'collapse',
    'collapseLowestContributor', 'inoculate', 'bindingOath'].includes(cause)) return true;
  // Card effects with a printed amount. Transfers and "half your LP" style effects stay murky.
  return /^(CR|BS|MAN|FIN)-\d\d$/.test(cause) && !['CR-15', 'MAN-07', 'MAN-19', 'FIN-02'].includes(cause);
}

function each(s: GameState, fn: (ai: AIState, seat: Seat) => void): void {
  s.ai.forEach((ai, seat) => {
    if (ai && !s.players[seat]!.eliminated) fn(ai, seat);
  });
}

/** The LP an AI believes a rival has. Its own LP is always known; cheating AIs read the truth. */
export function believedLP(s: GameState, me: Seat, other: Seat): number {
  if (me === other || s.aiCheats) return player(s, other).lp;
  return s.ai[me]?.lpEstimate[other] ?? player(s, other).lp;
}

/** Folds the events of one applyIntent call into every AI's beliefs. */
export function observe(s: GameState, events: GameEvent[]): void {
  const w = s.config.ai;
  for (const e of events) {
    switch (e.type) {
      case 'TurnStarted':
        each(s, (ai) => {
          for (let i = 0; i < ai.trust.length; i++) {
            ai.recentHarm[i]! *= w.harmDecay;
            ai.hostility[i]! *= w.hostilityDecay;
            if (s.difficulty === 'easy') {
              // Weak memory: feelings drift back to neutral quickly.
              ai.trust[i]! *= w.easyMemoryDecay;
              ai.hostility[i]! *= w.easyMemoryDecay;
            }
          }
        });
        break;
      case 'LPChanged':
        if (isTrackable(e.cause)) {
          each(s, (ai) => {
            ai.lpEstimate[e.seat] = Math.max(0, ai.lpEstimate[e.seat]! + e.delta);
          });
        }
        break;
      case 'LPRevealed':
        each(s, (ai, seat) => {
          if (e.to === 'all' || e.to === seat) ai.lpEstimate[e.seat] = e.value;
        });
        break;
      case 'InfluenceChanged':
        if (e.cause === 'CR-17') {
          // Signal Flare goes to the poorest: nobody believes they hold more than the lowest guess.
          each(s, (ai) => {
            const others = living(s).map((p) => ai.lpEstimate[p.seat]!);
            ai.lpEstimate[e.seat] = Math.min(ai.lpEstimate[e.seat]!, Math.min(...others));
          });
        }
        break;
      case 'StatusApplied':
        if (e.status === 'abilitiesDisabledUntil' && s.crisis && s.crisis.cardId === 'CR-13' && s.step === 'crisisGate') {
          // Shadow Embargo names the LP leader(s).
          each(s, (ai) => {
            const others = living(s).map((p) => ai.lpEstimate[p.seat]!);
            ai.lpEstimate[e.seat] = Math.max(ai.lpEstimate[e.seat]!, Math.max(...others));
          });
        }
        break;
      case 'ActionResolved': {
        const d = e.dial;
        const victim = d.action === 'sabotage' || (d.action === 'salvage' && s.modifiers.cannibalSalvage) ? d.target : undefined;
        if (victim !== undefined) {
          const ai = s.ai[victim];
          if (ai) {
            const m = s.modifiers;
            ai.recentHarm[e.seat]! += d.action === 'salvage' ? 2 : (m.sabotageDamageSet ?? s.config.sabotageDamage + m.sabotageDamageBonus);
            ai.hostility[e.seat] = clamp(ai.hostility[e.seat]! + w.sabotageHostilityGain * (0.5 + ai.personality.vengefulness), 0, 1);
            ai.trust[e.seat] = clamp(ai.trust[e.seat]! - w.sabotageTrustLoss, -1, 1);
          }
        }
        if (d.action === 'contribute') {
          each(s, (ai, seat) => {
            if (seat !== e.seat) ai.trust[e.seat] = clamp(ai.trust[e.seat]! + w.contributeTrustGain * (d.amount ?? 0), -1, 1);
          });
        }
        break;
      }
      case 'AbilityUsed':
        if (e.target !== undefined && e.target !== e.seat) {
          const ai = s.ai[e.target];
          if (ai) {
            if (e.ability === 'ventSector') ai.hostility[e.seat] = clamp(ai.hostility[e.seat]! + 0.2, 0, 1);
            if (e.ability === 'subpoena') ai.hostility[e.seat] = clamp(ai.hostility[e.seat]! + 0.1, 0, 1);
            if (e.ability === 'inoculate') ai.trust[e.seat] = clamp(ai.trust[e.seat]! + 0.3, -1, 1);
          }
        }
        break;
      case 'BallotCast':
        if (e.choice !== undefined && /^\d+$/.test(e.choice)) {
          const ai = s.ai[Number(e.choice)];
          if (ai) ai.hostility[e.seat] = clamp(ai.hostility[e.seat]! + 0.15, 0, 1);
        }
        break;
      case 'LiarExposed':
        each(s, (ai, seat) => {
          if (seat !== e.seat) ai.trust[e.seat] = clamp(ai.trust[e.seat]! - 0.1, -1, 1);
        });
        break;
      case 'DealKept':
      case 'DealBroken': {
        const deal = s.deals.find((d) => d.id === e.dealId);
        if (!deal) break;
        for (const [me, other] of [[deal.proposer, deal.partner], [deal.partner, deal.proposer]] as const) {
          const ai = s.ai[me];
          if (!ai) continue;
          if (e.type === 'DealKept') {
            ai.trust[other] = clamp(ai.trust[other]! + w.dealKeptTrustGain, -1, 1);
          } else if (e.breakers.includes(other)) {
            ai.trust[other] = clamp(ai.trust[other]! - w.betrayalTrustLoss, -1, 1);
            ai.hostility[other] = clamp(ai.hostility[other]! + w.betrayalHostilityGain, 0, 1);
          }
        }
        break;
      }
      case 'AbsencePunished': {
        const human = s.players.find((p) => p.isHuman);
        if (human) each(s, (ai) => (ai.hostility[human.seat] = clamp(ai.hostility[human.seat]! + e.hostility, 0, 1)));
        break;
      }
      default:
        break;
    }
  }
}
