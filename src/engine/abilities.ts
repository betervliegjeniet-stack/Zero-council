// The six faction actives (SPEC §3). Passives live where they apply (actions, upkeep, votes).
import { applyTimedStatus, changeInfluence, changeLP, emit, removeBlight, revealLP } from './effects';
import { ask } from './flow';
import { abilitiesActive, isActive, living, player } from './selectors';
import type { AbilityId, Ctx, GameState, PendingDecision, Seat } from './types';
import { IllegalIntentError } from './types';

export const VENT_COST = 4;
export const VENT_PAYMENT = 2;
export const PARANOIA_COST = 2;
export const MARTIAL_LAW_COST = 3;
export const INOCULATE_COST_LP = 2;

function requireWhisper(s: GameState): void {
  if (s.step !== 'whisper') throw new IllegalIntentError('That ability is used during the Whisper Campaign');
}

function requireFaction(s: GameState, seat: Seat, faction: string, oncePerTurn = true): void {
  const p = player(s, seat);
  if (p.eliminated || p.factionId !== faction) throw new IllegalIntentError(`Seat ${seat} does not have that ability`);
  if (!abilitiesActive(s, seat)) throw new IllegalIntentError('Faction abilities are disabled');
  if (oncePerTurn && p.abilityUsedThisTurn) throw new IllegalIntentError('Already used this turn');
}

function requireLivingTarget(s: GameState, target: Seat | undefined, self: Seat | null): Seat {
  if (target === undefined || !s.players[target] || s.players[target]!.eliminated || target === self) {
    throw new IllegalIntentError('That ability needs a living target');
  }
  return target;
}

export function useAbility(ctx: Ctx, seat: Seat, ability: AbilityId, target?: Seat, dealId?: string): void {
  const s = ctx.s;
  const p = player(s, seat);
  switch (ability) {
    case 'ventSector': {
      // Scrubber Guild: 4 Influence; a rival pays 2 Influence to the Guild or is Embargoed this turn.
      requireWhisper(s);
      requireFaction(s, seat, 'scrubbers');
      const t = requireLivingTarget(s, target, seat);
      if (isActive(s, player(s, t).status.silencedUntil)) throw new IllegalIntentError('A Silenced player cannot be vented');
      if (p.influence < VENT_COST) throw new IllegalIntentError('Vent the Sector costs 4 Influence');
      changeInfluence(ctx, seat, -VENT_COST, 'ventSector');
      p.abilityUsedThisTurn = true;
      emit(ctx, { type: 'AbilityUsed', seat, ability, target: t });
      const canPay = player(s, t).influence >= VENT_PAYMENT;
      ask(ctx, { seat: t, kind: 'ventResponse', options: canPay ? ['pay', 'embargo'] : ['embargo'], info: { by: seat } });
      return;
    }
    case 'inoculate': {
      // Blight Wardens: 2 LP to remove every cube from any player, themselves included.
      requireWhisper(s);
      requireFaction(s, seat, 'wardens');
      const t = requireLivingTarget(s, target, null);
      if (p.lp < INOCULATE_COST_LP) throw new IllegalIntentError('Inoculate costs 2 LP');
      changeLP(ctx, seat, -INOCULATE_COST_LP, 'inoculate');
      p.abilityUsedThisTurn = true;
      emit(ctx, { type: 'AbilityUsed', seat, ability, target: t });
      const tp = player(s, t);
      removeBlight(ctx, t, tp.blight.bio + tp.blight.neuro, 'inoculate');
      s.inoculations.push({ by: seat, target: t });
      return;
    }
    case 'subpoena': {
      // Black Urn Directorate: free, reveal one player's exact LP to everyone.
      requireWhisper(s);
      requireFaction(s, seat, 'directorate');
      const t = requireLivingTarget(s, target, seat);
      p.abilityUsedThisTurn = true;
      emit(ctx, { type: 'AbilityUsed', seat, ability, target: t });
      revealLP(ctx, t, 'all');
      return;
    }
    case 'bindingOath': {
      // Quiet Choir passive: once per Whisper, make one accepted deal of theirs binding.
      requireWhisper(s);
      requireFaction(s, seat, 'choir', false);
      if (p.oathUsedThisTurn) throw new IllegalIntentError('Binding Oath is once per Whisper');
      const deal = s.deals.find((d) => d.id === dealId);
      if (!deal || deal.status !== 'accepted' || deal.turn !== s.turn || (deal.proposer !== seat && deal.partner !== seat)) {
        throw new IllegalIntentError('Binding Oath needs one of your accepted deals from this Whisper');
      }
      deal.binding = true;
      p.oathUsedThisTurn = true;
      emit(ctx, { type: 'AbilityUsed', seat, ability });
      emit(ctx, { type: 'DealBound', dealId: deal.id, by: seat });
      return;
    }
    default:
      // Redact Name, Whispered Paranoia and Martial Law are offered by the engine as decisions.
      throw new IllegalIntentError(`${ability} is offered by the Council when its moment comes`);
  }
}

export function answerVent(ctx: Ctx, d: PendingDecision, option: string): void {
  const s = ctx.s;
  const guild = Number(d.info?.by);
  if (option === 'pay') {
    const paid = -changeInfluence(ctx, d.seat, -VENT_PAYMENT, 'ventSector');
    if (!player(s, guild).eliminated) changeInfluence(ctx, guild, paid, 'ventSector');
  } else {
    applyTimedStatus(ctx, d.seat, 'embargoedUntil', s.turn);
  }
}

/** Quiet Choir: after all dials are locked, offer the peek to every Choir that can pay. */
export function offerParanoia(ctx: Ctx): void {
  const s = ctx.s;
  if (s.modifiers.revealSequential) return; // every dial is already public
  for (const p of living(s)) {
    if (p.factionId !== 'choir' || !abilitiesActive(s, p.seat) || p.abilityUsedThisTurn || p.influence < PARANOIA_COST) continue;
    const rivals = living(s).filter((r) => r.seat !== p.seat && r.dial).map((r) => String(r.seat));
    if (rivals.length) ask(ctx, { seat: p.seat, kind: 'paranoiaPeek', options: [...rivals, 'pass'], defaultOption: 'pass' });
  }
}

export function answerParanoia(ctx: Ctx, d: PendingDecision, option: string): void {
  const s = ctx.s;
  if (option === 'pass') return;
  const p = player(s, d.seat);
  const target = Number(option);
  changeInfluence(ctx, d.seat, -PARANOIA_COST, 'whisperedParanoia');
  p.abilityUsedThisTurn = true;
  emit(ctx, { type: 'AbilityUsed', seat: d.seat, ability: 'whisperedParanoia', target });
  emit(ctx, { type: 'DialPeeked', seat: d.seat, target, dial: player(s, target).dial! });
  // Then they may change their own dial, unless the dials were spun at random (DQ-16).
  if (!s.modifiers.randomActions) {
    p.dialLocked = false;
    ask(ctx, { seat: d.seat, kind: 'dial', options: [], info: { afterPeek: 1 } });
  }
}

/** Iron Remnant seats that could pay for Martial Law right now. */
export function martialLawCandidates(s: GameState): Seat[] {
  return living(s)
    .filter((p) => p.factionId === 'iron' && abilitiesActive(s, p.seat) && !p.abilityUsedThisTurn && p.influence >= MARTIAL_LAW_COST)
    .map((p) => p.seat);
}

export function answerMartialLaw(ctx: Ctx, d: PendingDecision, option: string): void {
  const s = ctx.s;
  if (option !== 'ignore') return;
  const p = player(s, d.seat);
  if (p.influence < MARTIAL_LAW_COST) return;
  changeInfluence(ctx, d.seat, -MARTIAL_LAW_COST, 'martialLaw');
  p.abilityUsedThisTurn = true;
  s.scratch.shield.push(d.seat);
  emit(ctx, { type: 'AbilityUsed', seat: d.seat, ability: 'martialLaw' });
}
