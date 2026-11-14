// The Secret Action Dial (SPEC §2.5): which sectors are open, what they cost, and how they resolve.
import { addBlight, applyTimedStatus, changeInfluence, changeLP, emit, removeBlight, setFlagStatus } from '../effects';
import {
  abilitiesActive, isActive, isEmbargoed, isInfected, living, lpLeaders, player, poolThreshold,
} from '../selectors';
import type { ActionKind, Ctx, Dial, GameState, Seat } from '../types';
import { IllegalIntentError } from '../types';

export interface DialOption {
  action: ActionKind;
  available: boolean;
  /** Why the sector is locked or unaffordable (shown on the padlock). */
  reason?: string;
  /** Influence cost. For Sabotage: the cheapest target. For Contribute: the cost of putting in 1. */
  cost: number;
  /** Sabotage (and Salvage under Cannibalism): legal targets. */
  targets?: Seat[];
  /** Contribute: allowed amount range. */
  minAmount?: number;
  maxAmount?: number;
}

const SURCHARGED: ReadonlySet<ActionKind> = new Set(['salvage', 'sabotage', 'contribute', 'repair', 'medicalTax']);

/** The Influence a dial setting costs right now, with every modifier applied. */
export function actionCost(s: GameState, seat: Seat, dial: Dial): number {
  const c = s.config;
  const p = player(s, seat);
  let base = 0;
  switch (dial.action) {
    case 'salvage':
      base = p.factionId === 'archivists' && abilitiesActive(s, seat) ? c.salvageCostArchivists : c.salvageCost;
      break;
    case 'sabotage': {
      const discount =
        p.factionId === 'iron' && abilitiesActive(s, seat) &&
        dial.target !== undefined && lpLeaders(s).includes(dial.target);
      base = s.modifiers.sabotageCost ?? (discount ? c.sabotageCostIronVsLeader : c.sabotageCost);
      break;
    }
    case 'contribute':
      base = (dial.amount ?? 0) + s.modifiers.contributeSurcharge;
      break;
    case 'repair':
      base = c.repairCost;
      break;
    case 'medicalTax':
      base = c.medicalTaxCost;
      break;
    default:
      base = 0;
  }
  if (!isEmbargoed(s, seat)) return base;
  if (c.oxygenEmbargo) return base * 2;
  if (SURCHARGED.has(dial.action)) return base + c.embargoSurcharge;
  if (dial.action === 'gather') {
    return c.embargoGatherFreeWhenBroke && p.influence === 0 ? 0 : c.embargoSurcharge;
  }
  return base;
}

function sabotageTargets(s: GameState, seat: Seat): Seat[] {
  return living(s).filter((p) => p.seat !== seat).map((p) => p.seat);
}

/** Every sector of this player's dial, with its lock state. Idle is open only if nothing else is. */
export function dialOptions(s: GameState, seat: Seat): DialOption[] {
  const p = player(s, seat);
  const m = s.modifiers;
  const st = p.status;
  const opts: DialOption[] = [];
  const add = (action: ActionKind, lock: string | null, extra: Partial<DialOption> = {}, dial: Dial = { action }) => {
    const cost = actionCost(s, seat, dial);
    const reason = lock ?? (cost > p.influence ? 'Not enough Influence' : undefined);
    opts.push({ action, available: reason === undefined, reason, cost, ...extra });
  };

  // Contribute range: the largest amount whose full cost is still affordable.
  let maxContribute = 0;
  for (let amount = p.influence; amount >= 1; amount--) {
    if (actionCost(s, seat, { action: 'contribute', amount }) <= p.influence) {
      maxContribute = amount;
      break;
    }
  }
  const noPool = !s.config.contributeWithoutPool && poolThreshold(s) === null;
  const contributeLock = noPool ? 'No pool this turn' : maxContribute < 1 ? 'Not enough Influence' : null;

  if (isActive(s, st.conscriptedUntil)) {
    // MAN-09: the dial is forced to Contribute ALL Influence.
    if (maxContribute >= 1) {
      add('contribute', null, { minAmount: maxContribute, maxAmount: maxContribute }, { action: 'contribute', amount: maxContribute });
    } else {
      opts.push({ action: 'idle', available: true, cost: 0 });
    }
    return opts;
  }

  if (st.gatherLocked) {
    add('repair', null);
  } else {
    const lock = m.gatherBlocked ? 'Gather is locked this turn' : isActive(s, st.noGatherUntil) ? 'You cannot Gather this turn' : null;
    add('gather', lock);
  }

  const noSabSalv = isActive(s, st.noSabotageSalvageUntil) ? 'Forbidden by the Inquisition' : null;
  if (st.paralyzed) {
    add('medicalTax', null);
  } else {
    // CR-33 Cannibalism: Salvage needs a living rival who still has LP.
    const prey = m.cannibalSalvage ? living(s).filter((r) => r.seat !== seat && r.lp > 0).map((r) => r.seat) : undefined;
    const lock = m.salvageBlocked ? 'Salvage is locked this turn'
      : m.noLPGain ? 'No LP can be gained this turn'
      : noSabSalv ?? (prey && prey.length === 0 ? 'Nobody left to feed on' : null);
    add('salvage', lock, prey ? { targets: prey } : {});
  }

  const targets = sabotageTargets(s, seat);
  const cheapest = targets.length
    ? Math.min(...targets.map((t) => actionCost(s, seat, { action: 'sabotage', target: t })))
    : actionCost(s, seat, { action: 'sabotage' });
  {
    const reason = noSabSalv ?? (targets.length === 0 ? 'No rival left' : cheapest > p.influence ? 'Not enough Influence' : undefined);
    opts.push({ action: 'sabotage', available: reason === undefined, reason, cost: cheapest, targets });
  }

  add('contribute', contributeLock, { minAmount: 1, maxAmount: maxContribute }, { action: 'contribute', amount: 1 });
  add('quarantine', isInfected(p) ? null : 'Only when Infected');

  const anyOpen = opts.some((o) => o.available);
  opts.push({ action: 'idle', available: !anyOpen, reason: anyOpen ? 'Only when nothing else is possible' : undefined, cost: 0 });
  return opts;
}

/** Throws IllegalIntentError if the dial setting is not legal for this player right now. */
export function validateDial(s: GameState, seat: Seat, dial: Dial): void {
  const p = player(s, seat);
  const opt = dialOptions(s, seat).find((o) => o.action === dial.action);
  if (!opt) throw new IllegalIntentError(`${dial.action} is not on seat ${seat}'s dial`);
  if (!opt.available) throw new IllegalIntentError(`${dial.action} is locked for seat ${seat}: ${opt.reason}`);
  if (dial.action === 'sabotage') {
    if (dial.target === undefined || !opt.targets!.includes(dial.target)) {
      throw new IllegalIntentError('Sabotage needs a living rival as target');
    }
    if (dial.transferBlight) {
      const canTransfer = p.factionId === 'wardens' && abilitiesActive(s, seat) && isInfected(p);
      if (!canTransfer) throw new IllegalIntentError('Only an Infected Blight Warden can transfer Blight');
    }
  } else if (dial.transferBlight) {
    throw new IllegalIntentError('Blight transfer only goes with Sabotage');
  }
  if (dial.action === 'salvage' && opt.targets) {
    if (dial.target === undefined || !opt.targets.includes(dial.target)) {
      throw new IllegalIntentError('Under Cannibalism, Salvage needs a living rival with LP as target');
    }
  }
  if (dial.action === 'contribute') {
    const a = dial.amount;
    if (a === undefined || !Number.isInteger(a) || a < opt.minAmount! || a > opt.maxAmount!) {
      throw new IllegalIntentError(`Contribute amount must be ${opt.minAmount}..${opt.maxAmount}`);
    }
  }
  if (actionCost(s, seat, dial) > p.influence) throw new IllegalIntentError('Not enough Influence');
}

/** Resolves one revealed dial. Costs are paid here; an unaffordable action fizzles. */
export function resolveAction(ctx: Ctx, seat: Seat, dial: Dial, queued = false): void {
  const s = ctx.s;
  const c = s.config;
  const p = player(s, seat);
  if (p.eliminated) return;
  // `acted` records this turn's own dial; a dial queued by Mass Paranoia does not overwrite it.
  if (!queued) p.acted = { dial, fizzled: false };
  const fizzle = (reason: string) => {
    if (!queued) p.acted = { dial, fizzled: true };
    emit(ctx, { type: 'ActionFizzled', seat, dial, reason });
  };

  if (dial.action === 'idle') {
    emit(ctx, { type: 'ActionResolved', seat, dial, cost: 0 });
    return;
  }
  const cannibal = dial.action === 'salvage' && s.modifiers.cannibalSalvage;
  if (cannibal && (dial.target === undefined || player(s, dial.target).eliminated)) return fizzle('The target is gone');
  if (dial.action === 'sabotage' && (dial.target === undefined || player(s, dial.target).eliminated)) {
    return fizzle('The target is gone');
  }
  if (dial.action === 'quarantine' && !isInfected(p)) return fizzle('Nothing to quarantine');

  const cost = actionCost(s, seat, dial);
  if (cost > p.influence) return fizzle('Cannot pay');
  if (cost > 0) changeInfluence(ctx, seat, -cost, `cost:${dial.action}`);

  switch (dial.action) {
    case 'gather': {
      const yieldNow = isActive(s, p.status.gatherYield0Until) ? 0 : (s.modifiers.gatherYield ?? c.gatherYield);
      changeInfluence(ctx, seat, yieldNow, 'gather');
      break;
    }
    case 'salvage':
      changeLP(ctx, seat, c.salvageGain, 'salvage');
      if (cannibal) changeLP(ctx, dial.target!, -2, 'cannibalism');
      break;
    case 'sabotage': {
      const damage = s.modifiers.sabotageDamageSet ?? c.sabotageDamage + s.modifiers.sabotageDamageBonus;
      changeLP(ctx, dial.target!, -damage, 'sabotage');
      if (dial.transferBlight && p.factionId === 'wardens' && abilitiesActive(s, seat) && isInfected(p)) {
        const kind = p.blight.bio > 0 ? 'bio' : 'neuro';
        removeBlight(ctx, seat, 1, 'blightTransfer');
        addBlight(ctx, dial.target!, kind, 1, 'blightTransfer');
      }
      if (s.modifiers.sabotageInfects) {
        // BS-03 Cancer of the Soul: the saboteur is Infected and cannot Gather next turn.
        addBlight(ctx, seat, 'bio', 1, 'BS-03');
        applyTimedStatus(ctx, seat, 'noGatherUntil', s.turn + 1);
      }
      break;
    }
    case 'contribute': {
      const amount = dial.amount ?? 0;
      const from = s.crisis?.pool ?? 0;
      if (s.crisis) s.crisis.pool = from + amount;
      p.contributedTotal += amount;
      p.contributedThisTurn += amount;
      emit(ctx, { type: 'PoolChanged', from, to: from + amount, threshold: poolThreshold(s) });
      if (s.modifiers.contributeRewardLP > 0) changeLP(ctx, seat, s.modifiers.contributeRewardLP, 'contributeReward');
      // Scrubber Guild passive: +1 Influence per rival who Contributes.
      for (const g of living(s)) {
        if (g.seat !== seat && g.factionId === 'scrubbers' && abilitiesActive(s, g.seat)) {
          changeInfluence(ctx, g.seat, c.scrubberAirTax, 'airTax');
        }
      }
      break;
    }
    case 'quarantine':
      removeBlight(ctx, seat, 1, 'quarantine');
      break;
    case 'repair':
      setFlagStatus(ctx, seat, 'gatherLocked', false);
      break;
    case 'medicalTax':
      setFlagStatus(ctx, seat, 'paralyzed', false);
      break;
  }
  emit(ctx, { type: 'ActionResolved', seat, dial, cost });
}
