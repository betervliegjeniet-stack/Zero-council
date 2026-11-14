// Small helpers for the decision queue and the task queue.
import type { Ctx, PendingDecision, Task } from './types';

/** Asks a seat for a decision. The engine stops until every pending decision is answered. */
export function ask(ctx: Ctx, d: Omit<PendingDecision, 'id'>): void {
  const s = ctx.s;
  s.pending.push({ id: `q${s.nextId++}`, ...d });
}

/** Queues tasks to run next, in the given order, ahead of anything already queued. */
export function queueNext(ctx: Ctx, ...tasks: Task[]): void {
  ctx.s.tasks.unshift(...tasks);
}

export function resetScratch(ctx: Ctx): void {
  ctx.s.scratch = { choices: {}, bids: {}, shield: [] };
}
