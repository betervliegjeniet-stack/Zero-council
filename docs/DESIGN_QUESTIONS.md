# Design questions

Every entry is a place where the spec was silent or contradicted itself. Each one has a default, which
lives behind a flag in `src/engine/config.ts` where a flag makes sense. Status is **Approved** when the
designer has confirmed the default, **Open** when it is still only my reading.

## Approved by the designer (before M0)

| # | Question | Default taken | Config flag |
|---|---|---|---|
| 1 | Vote deals can't work for Mandates: Whisper is Phase 2 but the Mandate is drawn at the end of Phase 4. | The Mandate (or Finale card) is revealed face-up at the start of turns 3, 6 and 9 and resolved in Phase 4. | `revealMandateAtTurnStart` |
| 2 | Stage IV only gets one draw (turn 10), so 9 of its 10 cards never appear, and CR-31's "until repaired" never matters. CR-31 says System Reboot "extends the game", which §2.2 does not allow. | Kept as written: one Stage IV draw on turn 10; System Reboot does not extend the game. To be revisited with sim data in M3/M7. | `stageTurnBounds` |
| 3 | Is Contribute legal on a turn with no pool threshold? | Yes, always (BS-02 depends on it). The Influence is spent. | `contributeWithoutPool` |
| 4 | An Embargoed player with 0 Influence can only Idle, because Gather costs 1. | Gather is free for an Embargoed player who has 0 Influence. | `embargoGatherFreeWhenBroke` |
| 5 | §4.2 mentions a "Quarantined" status that §2.6 does not define. | Dropped. Self-Quarantine only voids that player's promise-deals (§2.5). | — |
| 6 | BS-04 has a reveal penalty and a tie penalty, but the data holds only one `eh` block. | Urn votes whose `eh.timing` is not `tie` use a default tie penalty of 3. | `defaultUrnTiePenalty` |
| 7 | CR-11 says queued actions resolve at the end of "Phase 3"; actions resolve in Phase 4. | Queued actions resolve in Phase 4 of the next turn, after that turn's actions. | — |
| 8 | FIN-03 is tagged `pool`, which generic crisis-pool handling would pick up. | Generic pool handling applies to `deck: "crisis"` only; FIN-03 gets its own one-round pool. | — |
| 9 | The tutorial scripts Flickering Grid (no pool) but coach mark 2 teaches the pool. | The tutorial will script CR-05 Water Leaking instead (M7). | `tutorialCardId` |
| 10 | When do timed statuses expire? Ticking at upkeep would wipe a status gained at resolution before it did anything. | Timed statuses store the last turn they cover. "For 1 turn" gained in Phase 4 of turn N covers turn N+1; "this turn" covers turn N. | — |
| 11 | The sim invariant "turn count ≤ 10 + overdrive" is backwards; Overdrive shortens the game. | The invariant is turn ≤ `totalTurns`. | — |
| 12 | Collapse penalty says "before turn 10 finished". Does EH hitting 0 during turn 10 count? Does CR-21 ending the game with EH above 0 count? | The penalty applies whenever the main game ends with EH at 0, on any turn, and never otherwise. | `collapsePenalty` |
| 13 | FIN-01's tie "sets EH to 2", which would heal the bunker when EH is 1. | Treated as "EH becomes at most 2". | `finaleExileTieNeverHeals` |
| 14 | With two players left, target votes always tie (no self-votes). | Target votes are skipped with two or fewer living players, as MAN-13 already does. | `skipTargetVotesAtTwoPlayers` |
| 15 | MAN-07 needs 4 votes on one player, nearly unreachable with 4 players. | Kept as written; report the hit rate in the sim. | `publicExecutionVotes` |
| 16 | Whispered Paranoia under random dials (CR-23, BS-01) or sequential reveal (CR-09). | The peek is allowed; changing your own dial is not allowed under random dials. | — |
| 17 | What happens to Blight gains at the cap of 20? | Gains beyond the cap are ignored. | `blightCap` |
| 18 | 7 expansion cards split "evenly" over two piles. | 3 in one pile and 4 in the other; the seed decides which. | — |
| 19 | `shortText` is required by §9.1 but missing from `cards.json`. | The 71 short texts are written in M4. | — |

## Open (found while building M0–M2)

| # | Question | Default taken | Config flag |
|---|---|---|---|
| 20 | Can a player choose to do nothing? §2.5 only describes Idle as a forced fallback. | Idle is offered only when no other sector is available. | — |
| 21 | Does the Iron Remnant's "LP leader" include the Iron Remnant itself? | Yes: the leader is the highest LP among all living players, so there is no discount if the Remnant leads alone. | — |
| 22 | Embargo "+1 on every action with a cost": does it hit Sabotage when Resource War makes it cost 0? | Yes (CR-27 says surcharges still apply). The surcharge goes on Salvage, Sabotage, Contribute, Repair and Medical Tax by kind; Self-Quarantine stays free. | `embargoSurcharge` |
| 23 | Who is first player after the previous first player is eliminated? | The marker moves to the next living seat clockwise each turn. | — |
| 24 | Attrition: what if only one player (or none) is left alive before turn 10? | The main game ends at once and goes to the Crucible, which ends immediately. No collapse penalty unless EH is 0. | — |
| 25 | The design pack never reached the repo; only a 6-page "Zero Hour" art bible (16 prototype cards) did. | Its four plates will be cropped for card art in M4; the other 55 cards get procedural art. Its rules text is an older version, so `cards.json` wins. The radio intro and faction lines will be written fresh in the spec's tone. | — |
| 26 | Which Crisis penalties can Martial Law ignore? The spec lists examples. | Every personal penalty from a Crisis card (LP or Influence loss, Blight, Exile, Embargo, ability disable, Silence, GatherLocked, Paralysis), including the result of a Crisis-card vote. Not elimination (CR-37, CR-40), not EH, not Mandates or Finale cards, and not a price the player chose to pay (BS-05 sacrifice, BS-06 payment). | — |
| 27 | Is CR-08's open vote an Urn vote? | No: the Directorate counts once and cannot break ties, Redact Name does not apply, and there is no tie penalty. | — |
| 28 | Redact Name: which ballots are cancelled? | The heaviest first (the Directorate's double ballot). Cancelled ballots break unanimity in MAN-20. It also works in the Judas Kiss. | — |
| 29 | Blackout (MAN-10): do the hidden card's effects apply before it flips? | Yes. Reveal effects and locks apply at once; only the card's identity is hidden until Phase 4. | — |
| 30 | When are deals checked, given vote promises over Mandates? | After the Mandate, at the very end of Phase 4 (the spec says before). A `willVote` term is checked against the first fitting vote of the turn and is void if there was none. | — |
| 31 | FIN-03: is the Influence spent if the pool of 15 fails? | Yes, spent either way, like a Crisis pool. A faction that is already Exiled is not picked for the purge. | — |
| 32 | FIN-02: who are "the two lowest bidders" with ties or few players? | Everyone whose bid is at or below the second-lowest bid, except the winner. | — |
| 33 | MAN-09 with a tie for 2nd place and a Directorate at the table. | The Directorate picks who fills the open slot(s), or lets the tie stand. | — |
| 34 | CR-11: is a queued action re-checked against next turn's locks? | No. Only cost and target are checked when it resolves; deal promises are judged on the dial chosen. | — |
| 35 | `revealLP` in a deal: who learns the number? | Only the deal partner (Subpoena and Legacy Audit reveal to everyone). | — |
| 36 | A fizzled action and promises. | A fizzled Contribute or Sabotage does not keep a promise; a fizzled Sabotage does not break "will not Sabotage". | — |
