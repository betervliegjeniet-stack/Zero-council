# ZERO COUNCIL — Mobile Single-Player Prototype
## Build Specification for Claude Code

> **Read this whole file before you write any code.** This spec turns the *Zero Council* tabletop design (4–6 players, real-time negotiation, physical dials and urn) into a **single-player mobile game**. The human plays one faction; 3–5 AI Councilors play the rest.
>
> Source of truth, in order of priority:
> 1. **This spec** (the digital rulings, which settle ambiguities in the tabletop rules)
> 2. `data/cards.json`: all 71 cards, each with a machine-readable `eh` / `mitigation` / `tags` block and a plain-English `digitalRuling`. **Implement `digitalRuling`, not the `printed` text.**
> 3. `data/factions.json`: the 6 factions, their abilities and AI personalities
> 4. `design-pack/`: the original GDD, CSV, compendium and rulebooks (for tone and flavor only)
>
> The card artwork images contain rules text that is **out of date** (for example, the art for Oxygen Scrubber Failure says EH -3, but the CSV says -2). Use the artwork **only as illustration**: crop out the art area and render all rules text from `cards.json`.

---

## 0. Project setup

```
zero-council/
├── CLAUDE.md                     ← short pointer: "Follow docs/SPEC.md. Run tests before finishing a milestone."
├── docs/SPEC.md                  ← this file
├── data/cards.json               ← provided (71 cards)
├── data/factions.json            ← provided (6 factions)
├── design-pack/                  ← the user's Zero_Council_Master_Design_Pack contents (read-only)
├── public/
│   ├── art/cards/                ← cropped card art (see §9.3)
│   ├── art/ui/                   ← tracker board, dial, faction mat textures
│   ├── icons/ manifest.webmanifest
├── src/
│   ├── engine/                   ← PURE TypeScript. No React, no DOM, no audio.
│   │   ├── types.ts  rng.ts  config.ts  setup.ts
│   │   ├── phases/ crisis.ts whisper.ts actions.ts resolve.ts mandate.ts crucible.ts
│   │   ├── cards/ index.ts (registry) + one handler file per card group
│   │   ├── status.ts  votes.ts  deals.ts  abilities.ts  selectors.ts
│   │   └── ai/ personality.ts beliefs.ts chooseAction.ts whisper.ts vote.ts bid.ts
│   ├── ui/                       ← React components & screens
│   ├── fx/ animations.ts haptics.ts
│   ├── audio/ sfx.ts ambience.ts
│   ├── store/ gameStore.ts       ← Zustand: holds GameState + event playback queue
│   └── main.tsx
├── sim/ simulate.ts              ← headless AI-vs-AI batch runner (balance report)
└── tests/                        ← Vitest
```

**Stack (fixed; do not substitute):**
- **Vite + React 18 + TypeScript (strict)**
- **Zustand** for state, **Framer Motion** for animation, **Vitest** for tests
- **Web Audio API** for synthesized sound effects (no audio files needed in the prototype; §11)
- **PWA** (vite-plugin-pwa) so it installs to the home screen and works offline
- Later: **Capacitor** wrapper for iOS/Android store builds (Milestone 8; don't add it earlier)
- No backend. No accounts. Save to `localStorage`.

Commands that must work: `npm run dev`, `npm run build`, `npm test`, `npm run sim -- --games 1000`.

---

## 1. Prototype scope

**In scope**
- Single player against 3–5 AI rivals (player count 4, 5 or 6, default 6)
- All 6 factions playable, each with its passive and active ability
- All **71 cards** in the game, rendered and working: 40 Core Crisis, 7 Biological Schism, 4 Finale, 20 Apex Mandates
- The full 10-turn loop: Crisis → Whisper → Secret Actions → Resolution → Mandates (turns 3/6/9), then **The Crucible**
- Portrait mobile UI, sound effects, card and token animations, haptics
- A Codex screen to browse all 71 cards and the rules
- Save/resume of the current game

**Out of scope for now:** multiplayer, accounts, monetization, localization, voice audio of the radio script (the text version is in scope).

---

## 2. Canonical digital ruleset

The tabletop documents disagree with each other in places. **These rulings are final for the digital build.** Every number in this section must live in `src/engine/config.ts` as a `RulesConfig` object, so the designer can tune it without touching logic.

### 2.1 Setup
- `playerCount` ∈ {4,5,6}. Starting EH = **20** (18 with 4 players). `maxEH` = starting EH (healing never goes above it).
- The human chooses a faction; AI factions are drawn at random from the rest. Seats go clockwise: seat 0 = human, then AIs.
- **Starting resources come from the faction table** (`factions.json`: Archivists 4/4, Scrubbers 6/2, Choir 5/3, Iron 5/3, Wardens 4/3, Directorate 6/2). They replace the generic 5 Influence / 3 LP.
- Supply: Influence and LP are unlimited in the digital version. Blight Cubes are capped at 20 in play (`blightCap`).
- **Seat geometry:** LEFT of seat *i* = seat *(i+1) mod n*; RIGHT = seat *(i−1+n) mod n*. Eliminated players are skipped.
- **Turn order:** the first player rotates clockwise each turn (turn 1 starts with seat 0). Actions resolve in turn order.

### 2.2 Crisis deck (fixes the "only Stage I is ever drawn" problem)
The tabletop text says to stack 40 cards but play only 10 turns, which would mean only Stage I cards ever come up. Digital ruling:
- There are four separate shuffled **stage piles**. **Turns 1–3 draw from Stage I, 4–6 from Stage II, 7–9 from Stage III, and Turn 10 from Stage IV.**
- `expansionEnabled` (default **on**): shuffle the 7 Biological Schism cards evenly at random into the Stage II and III piles.
- If a pile runs out (possible after Emergency Overdrive or System Reboot), draw from the next stage; after Stage IV, from Stage IV discards.
- **System Reboot (MAN-14)** shuffles the whole Crisis discard pile into the Stage III pile.
- **Emergency Overdrive (MAN-17)** moves the turn counter forward 1. The stage for a turn always follows the turn number.
- **Finale deck** (`finaleMode`, default `"replaceTurn9Mandate"`): at the end of Turn 9, draw 1 of the 4 Finale cards *instead of* an Apex Mandate, so its effects carry into Turn 10. Option `"off"` disables the Finale deck.
- **Apex Mandate deck**: 20 cards, shuffled. Draw one at the end of turns 3 and 6, and turn 9 too if the finale is off.

### 2.3 Earth Health & mitigation timing (the most important ruling)
Every card has `eh.timing`:
- `reveal`: apply the EH change straight away in Phase 1.
- `unmitigated`: apply it **only if the Council fails the card's mitigation** in Phase 4. *This is what makes contributing matter.*
- `tie`: apply it only if the card's Urn vote ties.
- `resolve`: apply it at resolution under the condition in `digitalRuling`.

EH is clamped to [0, maxEH]. **If EH hits 0 at any time, finish resolving the current effect, then go to the Crucible.**

**Total Collapse penalty (new rule, fixes an incentive gap):** in the tabletop rules nothing bad happens to an individual when EH hits 0, so there is little reason to contribute. Digital rule: `collapsePenalty` (default **on**) — if the main game ends because EH reached 0 *before turn 10 finished*, every living player loses `floor(LP / 2)` before the Crucible, and the player(s) with the lowest total contribution this game lose 1 more LP. Track `contributedTotal` per player. Show this rule on the Crisis HUD as "If the bunker fails, everyone bleeds."

### 2.4 Turn sequence (per turn)
0. **Upkeep** (start of turn): run Blight drain (§2.6), tick durations of timed statuses, clear last turn's modifiers.
1. **Phase 1 — Crisis Reveal:** draw (face-down if the Blackout status is active), apply `reveal` effects and instant effects, then register turn modifiers (tags `mod:*`).
2. **Phase 2 — Whisper Campaign:** a real-time deal phase (§4). Skipped by Dead Frequency (CR-36).
3. **Phase 3 — Secret Actions:** every player sets their dial (plus an LP Pledge if the card needs one), active abilities fire in their windows, then all dials are revealed at once (or one by one under Static Interference).
4. **Phase 4 — Resolution:** resolve actions in turn order, then check the pool or mitigation, then apply card penalties, choices and votes, then check deals, then run the **Apex Mandate** on turns 3/6 (and the Finale card on turn 9).
5. **End of turn:** if turn 10 just ended, or EH = 0, or a card ended the game, go to the Crucible. Otherwise turn++.

### 2.5 Actions (the Secret Action Dial)
| Action | Base cost | Effect | Notes |
|---|---|---|---|
| **Gather** | 0 | +2 Influence | Changed by Supply Chain Snap (1), Austerity (0), Total Darkness (locked), GatherLocked→**Repair** (3 Inf, restores Gather next turn) |
| **Salvage** | 3 Inf | +1 LP | Archivists pay 2. Locked by Ration Shortage, Echoes, Paralyzed (offers **Medical Tax**: pay 5, clears status), Inquisition |
| **Sabotage** | 2 Inf | target rival −1 LP | Iron Remnant pays 1 vs LP leader. Damage modifiers: Medical Collapse +1, Entropy Strike =3. Cost 0 under Resource War |
| **Contribute** | X Inf (X ≥ 1) | X into the Global Pool | Fuel Depletion adds +1 surcharge. The Scrubber Guild gets +1 per rival who Contributes. Extra Influence beyond the threshold is lost |
| **Self-Quarantine** | 0 | remove 1 Blight Cube | Only allowed if Infected. Choosing it **voids that player's promise-deals for the turn** (no trust change, no Binding Oath penalty). Influence already handed over stays where it is |

- **Embargoed:** every action with a cost costs +1 Influence, and Gather also costs 1 (so the action can be paid for). Under `oxygenEmbargo`, costs are doubled instead. *(No card in the current set applies Oxygen Embargo; keep the flag for future cards.)*
- **Paying:** cost is checked when the dial is locked in (the UI disables sectors you can't afford) and paid at resolution. If a player can no longer pay at resolution (they lost Influence earlier in the turn order), the action **fizzles** with a "FIZZLED" stamp.
- **Can't-act fallback:** if every sector is locked or unaffordable, the dial is forced to **Idle** (does nothing).
- Influence and LP never go below 0. Damage beyond 0 is wasted.

### 2.6 Statuses
| Status | Data | Behaviour |
|---|---|---|
| **Infected** | `blight: {bio:number, neuro:number}` | Upkeep: lose 1 LP per bio cube and 1 Influence per neuro cube. Blight Wardens ignore their first cube (bio first). Cured by Self-Quarantine (removes 1, bio first), Inoculate (all), Amnesty of Ash (all). |
| **Embargoed** | `turns` | +1 cost on all actions. |
| **Exiled** | permanent bool | Faction abilities are off. The mat flips face-down (animation). No current card restores it. |
| **AbilitiesDisabled** | `turns` | Like Exile but temporary (Data Corruption, Shadow Embargo, Liquid Oblivion). |
| **Silenced** | `turns` | Cannot send, receive or accept deals (Hollow Echo). |
| **NoTrade** | `turns` | Same as Silenced, but they can still be targeted by Vent Sector. |
| **GatherLocked** | until repaired | Gather is replaced by Repair (3 Inf). |
| **Paralyzed** | until paid | Salvage is replaced by Medical Tax (5 Inf). |
| **NoGatherNextTurn / NoSabotageSalvageNextTurn / GatherYield0** | 1 turn | from BS-03, MAN-16, MAN-06 |
| **Conscripted** | 1 turn | the dial is forced to Contribute ALL Influence (MAN-09) |
| **Blackout** | global, 1 turn | next Crisis is shown face-down (MAN-10) |
| **Eliminated** | permanent | removed from play; seat greyed with a "DELETED" glitch label |

Statuses that say "next turn" are applied at the end of the turn they're gained, so they cover exactly the following turn.

### 2.7 Ties and "the player with the most/least X"
- **Penalties and rewards aimed at "the player with the most/least X" hit ALL tied players**, unless the card's `digitalRuling` says otherwise.
- **Urn vote ties** → the card's tie penalty (`eh.timing: "tie"`) and the Mandate fails, unless the **Black Urn Directorate** (not Exiled or disabled) breaks it. The Directorate chooses one of the tied options. As an AI, it picks the option that hurts its worst enemy; it chooses "chaos" (let the tie stand) only if EH ≥ 12 and its vengefulness is ≥ 0.7. When the human plays the Directorate, show a tie-break modal with a "LET IT BURN" option.

### 2.8 Hidden information (the paranoia engine)
- **Influence is public.** Everyone's Influence count is always shown.
- **LP is hidden.** Rivals' LP is shown as **"?"** until revealed (Subpoena, Legacy Audit, some deals). A revealed value is shown with a small "as of turn N" timestamp and dims as it gets older.
- The human always knows their own LP.
- The engine knows everything. When a rule refers to "the LP leader", the engine resolves it and only announces *who* was affected.
- AI players must not read hidden values; they use **beliefs** (§5.2). (Merciless difficulty may cheat; see §5.)

### 2.9 Apex Mandates and the Black Urn
- Ballot types (`tags`): `vote:urn_target`, `vote:urn_two_targets`, `vote:aye_nay`, `vote:mercy`, `vote:judas`, `vote:unanimous`, `vote:open_target`.
- **Self-votes are not allowed** for target votes. Every living player must vote; there is no abstaining.
- The Directorate's ballot counts as 2 (its Casting Vote passive).
- **Archivists' Redact Name** (once per game): after the ballots are cast, if the Archivist is named on any, they privately see "N ballots name you" and may cancel up to 2. AI Archivists use it only if they would otherwise be the target.
- **Count reveal:** ballots come out of the urn one at a time (animation) and the tally builds up.
- **Winner** = most votes. A tie for most = tie (the Directorate may break it).

### 2.10 The Crucible (endgame)
1. Influence becomes worthless (cogs crumble to dust in an animation). Only LP counts.
2. **Blind-bid rounds:** each living player secretly bids 0..LP. Fists open at the same time.
3. The lowest bidder is **Deleted**. A tie for lowest → the tied player with the fewest LP *remaining after their bid* is deleted; if still tied, **all** of them are deleted.
4. Every bid LP is destroyed, the survivors' bids included.
5. Repeat until 1 player is left (the **Last Survivor**) or 0 (**Total Extinction**). Every round deletes at least one player, so this always ends.
6. If the human is deleted at any point in the game, offer **"Watch the end"** (fast-forward with skippable animations) or **"Return to the Bunker"** (main menu).

### 2.11 End screen tone: "There are no winners"
Never use the words *Victory* or *You Win*. Survivor text: "You are the Last Survivor. The bunker hums for no one." Deleted text: "DELETED. The Council does not remember your name." Extinction: "TOTAL EXTINCTION. Silence wins." Show stats: turns survived, LP forged, LP destroyed, Influence contributed, deals made and broken, times you were betrayed, and the cause of death.

---

## 3. Faction abilities, digital form
`factions.json` has the text. Implementation details:

| Faction | Passive (automatic) | Active (button on the player's mat, glowing when usable) |
|---|---|---|
| **Archivists of Ash** | Salvage costs 2 | **Redact Name**: once per game, in the vote window (§2.9) |
| **Scrubber Guild** | +1 Influence per rival Contribute (counted at resolution; float a "+1 AIR TAX" cog per contributor) | **Vent the Sector**: Whisper phase, 4 Influence, pick a rival → they choose to pay 2 Influence to the Guild or be Embargoed this turn (AI: pays if Influence ≥ 4 and it isn't hostile). Once per turn |
| **Quiet Choir** | **Binding Oath**: once per Whisper, tap the seal icon on an *accepted* deal to make it binding; whoever breaks it loses 2 LP at deal-check | **Whispered Paranoia**: after all dials are locked, 2 Influence → see one rival's dial, then you may change yours (once per turn) |
| **Iron Remnant** | Sabotage costs 1 against the LP leader (ties count). The dial shows the discounted cost only when the target qualifies; the engine checks this secretly | **Martial Law**: a reactive popup when a *personal* Crisis penalty is about to hit you (LP/Influence loss, Embargo, Exile, Infection, ability disable from a Crisis card, but not EH changes and not Mandates): "Spend 3 to ignore?" (5-second auto-decline timer). Once per turn |
| **Blight Wardens** | Ignore the first cube's drain. On Sabotage: an optional "Transfer Blight?" toggle on the dial when you have ≥1 cube | **Inoculate**: Whisper phase, 2 LP → remove all cubes from any player (yourself included). Can be offered as a *deal term* ("I'll cure you for 4 Influence") |
| **Black Urn Directorate** | The ballot counts double; breaks Urn ties (§2.7) | **Subpoena**: Whisper phase, free, once per turn → reveal one player's LP to everyone (dramatic stamp animation) |

Abilities don't work while the faction is Exiled or AbilitiesDisabled. Show a padlock over the button and a tooltip saying why.

---

## 4. The Whisper Campaign → a single-player deal system
The tabletop version is 3 minutes of free talk. On mobile it becomes a **timed deal board**: AIs whisper to you, you whisper to them, and AIs make deals with each other that you only partly see.

### 4.1 Timer
- `whisperSeconds` setting: **45 (default)** / 30 / 90 / 180 ("Tabletop").
- The timer **never pauses**. It uses wall-clock time (`Date.now()`), not a ticking interval. A "SEAL THE COUNCIL" button ends the phase early (and AIs get one last round of offers).
- **The Bathroom Break Rule:** if the app goes into the background during Whisper (`visibilitychange`), the timer keeps running. When the player comes back, show **"While you were gone…"** with what the AIs did: they spent the time conspiring, and each AI's hostility toward the human goes up by `absencePenalty` (0.15 per 10 s away, max 0.6). They may also have made deals against you. If the timer ran out while you were away, your dial phase starts with **5 seconds** to choose, after which a random legal action is picked.

### 4.2 Deal model
```ts
type DealTerm =
  | { kind: 'giveInfluenceNow'; from: Seat; amount: number }        // executed immediately on accept, binding by nature
  | { kind: 'willContribute'; who: Seat; min: number }
  | { kind: 'willNotSabotage'; who: Seat; target: Seat }
  | { kind: 'willSabotage'; who: Seat; target: Seat }
  | { kind: 'willVote'; who: Seat; target: Seat | 'aye' | 'nay' }   // checked at the next vote
  | { kind: 'willInoculate'; who: Seat; target: Seat }              // Wardens only
  | { kind: 'revealLP'; who: Seat };                                // executed on accept (voluntary disclosure)
type Deal = { id; proposer: Seat; partner: Seat; terms: DealTerm[]; status: 'offered'|'accepted'|'rejected'|'expired'|'kept'|'broken'; binding: boolean; turn: number };
```
- A deal is 1–2 terms from each side, built from templates. The UI shows it as a **torn paper note** card with ACCEPT / REJECT / COUNTER (counter = change the amount ±1 or swap one term).
- **Non-binding:** after Phase 4, the engine checks each accepted promise-term against what actually happened. Kept → trust +; broken → trust −− and a "BETRAYED" stamp in the log. If the deal was made **binding** by the Quiet Choir → the breaker loses 2 LP.
- Players who are Silenced, NoTrade or Quarantined can't take part in deals.
- **AI-to-AI deals** happen too. The human only sees a **rumor feed** ("The Iron Remnant and the Quiet Choir whisper behind cupped hands…"), unless the human is part of the deal.
- **Limits:** each AI sends at most 2 offers to the human per Whisper; the human may send at most 3 offers per Whisper (keeps the pace up on mobile).

### 4.3 Special Whisper variants
- **CR-19 Whisper Campaign:** a public announcement step at the end of the phase (see the card ruling).
- **CR-36 Dead Frequency:** the phase is skipped (a static screen).
- **MAN-19 The Silent Ballot:** no deals during that vote.

---

## 5. AI Councilors

### 5.1 Personality
Each AI has a vector `{greed, aggression, cooperation, honesty, vengefulness, risk}` in [0,1]. Use the faction default from `factions.json`, ±0.15 random jitter per game (seeded). Difficulty:
- **Easy:** bigger random noise in decisions (softmax temperature 1.0) and weak memory (trust drifts back to neutral quickly).
- **Normal (default):** temperature 0.4, full memory.
- **Merciless:** temperature 0.15, and the AIs coordinate against the leader. *May read true LP values* (setting `aiCheats`, default off even on Merciless).

### 5.2 Beliefs
Each AI keeps `trust[seat]` (−1..1), `hostility[seat]` (0..1) and `lpEstimate[seat]`. Update the LP estimates from public events: Salvage/Sabotage actions seen at reveal, reveals, Signal Flare recipients, and Shadow Embargo targets.

### 5.3 Action choice (utility scoring + softmax)
Score each legal action, then sample with softmax at the difficulty's temperature. Core heuristics (all weights in `config.ts`):
- `phase = turn / 10` (late game makes LP worth more).
- **Gather:** high when Influence < 3; decays as Influence rises; ×greed.
- **Salvage:** `(0.6 + phase) × greed`. Bonus if Influence ≥ cost + 2. Zero if locked.
- **Sabotage:** for each target: `aggression × (lpEstimate[target] leader bonus) + hostility[target] + vengefulness × recentHarmFrom[target] + phase`. Penalty if it would break a deal (scaled by honesty). Pick the target with the best score.
- **Contribute:** expected harm if the crisis goes unmitigated (EH loss scaled by how close EH is to 0, plus personal penalties, plus the Total Collapse risk) × cooperation, minus a free-rider term (estimated contributions from others: Influence of cooperative rivals and deals promising Contribute). Amount = `ceil(remainingThreshold × fairShare)`, where `fairShare = 1/livingPlayers`, raised if the threshold is otherwise unreachable and the AI cares (cooperation > 0.5), and capped so it keeps `risk`-scaled reserves.
- **Self-Quarantine:** if bio cubes ≥ 1 and turns remaining ≥ 2, or neuro cubes ≥ 2.
- **Honor deals:** before scoring, add a bonus to actions that keep promises (`honesty × trust[partner]`) and a penalty to actions that break them. Binding deals are never broken unless the expected gain is more than 2 LP.

### 5.4 Whisper behaviour
- Offer deals that fit the personality: cooperative AIs propose "both Contribute 3"; greedy ones sell non-aggression for Influence; aggressive ones propose "Sabotage the leader with me"; Wardens sell Inoculate.
- Accept a deal if its expected value is > 0 for the AI after a trust discount.
- Flavor lines for each faction (5–8 per message type) live in `src/engine/ai/lines.ts`. Write them in the GDD's grimdark voice. Example: Iron Remnant: *"Contribute three, Councilor, or I contribute your skull."*

### 5.5 Voting
- Target votes: pick the rival with the highest `hostility + perceived threat (LP leader) − trust`. Honor `willVote` deals according to honesty.
- Aye/Nay: work out the expected change in own LP plus the EH effect × cooperation; vote Aye if it's positive.
- Avoiding ties: if an AI can see that the current public deals point to a tie and cooperation > 0.6, it switches its vote to the leading option.

### 5.6 Crucible bidding
- With n players left: estimate the opponents' LP distribution. Bid enough to beat the *expected lowest* opponent bid, plus a margin of `risk`, keeping a reserve for the later rounds (`reserve = LP × (n−2)/(n)`). With 2 players left, bid everything.
- Add a little seeded noise so the AIs aren't predictable.

### 5.7 Headless simulation (balance tool for the designer)
`npm run sim -- --games 1000 --players 6 --seed 1` runs all-AI games and prints: games ended by EH = 0 vs turn 10; average final EH; Last Survivor rate per faction; Total Extinction rate; average LP at the Crucible; how often each card was mitigated; deals kept vs broken. **The test suite must include a 500-game sim that finishes with zero thrown errors and no state invariant violations** (no negative resources, no dead players acting, the turn count ≤ 10 + overdrive).

---

## 6. Engine architecture
- **One immutable `GameState`** (serializable JSON) plus pure functions: `applyIntent(state, intent) → { state, events }`.
- **Intents** come from the human UI or the AI (`SetDial`, `LockDial`, `ProposeDeal`, `RespondDeal`, `UseAbility`, `CastBallot`, `PledgeLP`, `SubmitBid`, `ChooseOption`, `Advance`).
- **PendingDecision queue** in the state: when the engine needs input (a vote, a choice, a volunteer prompt, Martial Law), it pushes a `PendingDecision {seat, kind, options, timeoutMs}` and waits. AI seats get answered right away by the AI module; the human's decisions show up as UI modals.
- **Events** (`CardRevealed`, `EHChanged{from,to,cause}`, `InfluenceChanged`, `LPChanged{hidden:boolean}`, `DialsRevealed`, `ActionFizzled`, `BallotCast`, `VoteResult`, `StatusApplied`, `PlayerDeleted`, `DealBroken`, …) are the **only** thing the UI animates. The store plays them back one after another with each event's animation and sound, with a global "fast" toggle and tap-to-skip.
- **Seeded RNG** (mulberry32) stored in the state. Same seed + same intents = same game. Show the seed in Settings so bug reports can be replayed.
- **Card registry:** `cards/index.ts` maps each card id → `{ onReveal?, modifiers?, onResolve?(ctx, mitigated), vote?: VoteSpec, onVoteResult? }`. Generic `pool_influence`/`tie` handling is done once from the JSON fields; handlers only implement the special parts. **A startup assertion fails if any of the 71 ids in cards.json has no handler.**
- **Tests:** at least one test per card (set up a state, apply the card, check the result), one per faction ability, the tie rules, the Crucible tie-break, the stage-draw rule, and the deal-checking rules.

---

## 7. Mobile UX
Target: **portrait, 360–430 px wide, works one-handed.** Lay out for 390×844 and test at 360×740 and 430×932. Respect `env(safe-area-inset-*)`. Touch targets ≥ 44 px. Primary actions sit in the **bottom 40%** of the screen (thumb zone). No hover-only interactions. Text ≥ 14 px; card effect text ≥ 13 px on the zoomed card.

### 7.1 Screens
1. **Title:** a black screen, then the radio broadcast from the GDD typed out line by line with static crackle, ending on a vault-door THUD and the title in crimson. Buttons: *Enter the Bunker*, *Continue*, *Codex*, *Settings*. A tap skips the intro.
2. **Council Setup:** a horizontal swipe carousel of the 6 faction mats (sigil, start pool, passive/active, a one-line playstyle tip); player count 4/5/6; difficulty; toggles for Biological Schism, Finale deck and Collapse penalty; Whisper timer length; first-game tutorial toggle.
3. **The Bunker (main game screen)**, top to bottom:
   - **Collapse Tracker strip (top, ~64 px):** 10 small gear slots for the turns (current one rusty-glowing, Mandate turns 3/6/9 marked with an urn icon); below it the **EH bar** (20 segments, skull marker, colour going bone → amber → blood red), the number, and the stage name.
   - **Rivals row (~84 px):** 3–5 compact rival chips you can scroll sideways: sigil, name, Influence (cog), LP ("?" or the revealed value), status icons (purple cubes, lock = embargo, flipped = exiled, stitched mouth = silenced), and a trust indicator (a thin line, green → red). Tap = rival detail sheet (deal history, revealed info).
   - **Crisis zone (centre):** the current Crisis card at ~45% screen height, the **Global Pool meter** under it ("7 / 10"), and modifier chips ("SALVAGE LOCKED", "SABOTAGE x3"). Tap the card = full-screen zoom with flavor text.
   - **Your Faction Mat (bottom):** Influence, LP, Blight cubes, ability buttons, and a **phase button** that changes label: *Begin Whisper* → *Set Your Dial* → *Lock In* → *Continue*.
   - **Log drawer:** pull up from the bottom edge for the full event log of this turn.
4. **Whisper overlay:** a bottom sheet (85% height) with the timer as a draining arc, incoming deal notes as stacked cards (swipe right = accept, left = reject, tap = details/counter), a "+ Whisper" button to build an offer (pick rival → pick template → steppers), and the rumor feed. Ability buttons that work during Whisper (Vent, Inoculate, Subpoena, Binding Oath seal) sit here too.
5. **Action Dial overlay:** a big circular dial (≥ 300 px) with the 5 sectors (Gather, Salvage, Sabotage, Contribute, Quarantine) and Repair/Medical Tax when they apply. Drag to rotate; it snaps to a sector with a tick. Locked sectors are dark with a padlock and the reason. The effective cost is shown in the centre. After choosing Sabotage, the rival chips light up so you can pick a target; for Contribute an amount stepper appears. **Hold to Seal** (600 ms long-press with a filling ring) commits the choice. Optional LP Pledge stepper for CR-26.
6. **Reveal sequence:** all dials (yours and the rivals' mini dials) flip together, then each action resolves in turn order with its animation.
7. **Black Urn overlay:** the Mandate card at the top; ballot options as large buttons; your ballot drops into the urn; AI ballots drop in after you; then ballots come out one by one and the tally builds; result stamp.
8. **Crucible screen:** dark red with all colour drained. Your skull stack and a bid stepper (big + and − buttons and a slider) with "Close Fist". Rivals show closed-fist icons. All fists open together, bids fly into the abyss (falling, fading skulls), and the lowest bidder's portrait **glitches and burns out**. Repeat.
9. **End screen** (§2.11), with *Again* and *Codex* buttons.
10. **Codex:** filter by deck (Crisis I–IV / Biological Schism / Finale / Mandates) and search. Shows all 71 cards as a grid of rendered cards; tap to zoom; a "Digital ruling" panel under each card. Also a Rules tab (a compact version of §2) and a Factions tab.
11. **Settings:** sound volume, music/ambience volume, haptics, reduced motion, animation speed (Normal/Fast), whisper timer, show the seed, reset save.

### 7.2 Tutorial (first game, toggle)
Turn 1 is scripted with Flickering Grid → coach marks: (1) EH and turns, (2) the Crisis card and pool, (3) one AI offer to accept, (4) setting the dial to Gather, (5) reveal. After that the game runs normally. Coach marks are skippable.

---

## 8. Visual style
- Grimdark bunker: near-black backgrounds (#0b0a09), bone white (#e8e0cc), blood crimson (#b3121b), rust (#8c4a1d), toxic green (#9cff6a) for life-support, blight purple (#b04cff).
- Typography: a condensed distressed display face for titles (bundle **"Oswald"** or **"Bebas Neue"** locally under `public/fonts`, with a CSS grunge mask) plus a readable body serif (e.g. **"Crimson Pro"**) for flavor text, and a sans for rules text.
- Texture: a subtle CSS/SVG noise overlay and vignette on every screen; a slow 0.4 Hz flicker on the background lights (turned off under reduced motion).
- Stage colour coding for card frames: I = rust/amber, II = sickly green, III = blood red, IV = void black with a white glitch edge, Biological Schism = purple, Finale = gold-on-black, Mandate = urn black with brass.

---

## 9. Cards: rendering all 71

### 9.1 Card component `<CardView card={…} size="mini|board|zoom" />`
Aspect ratio **5:7** (from the 3.5"×5" tarot format). Layout, top to bottom:
1. Header band: deck/stage label ("STAGE II — THE DEEPENING SCHISM", "APEX MANDATE", "THE BIOLOGICAL SCHISM EXPANSION", "FINALE")
2. **Title** in the display font, auto-shrink to fit in 2 lines
3. **Art window** (~45% of height): the PNG if `artFile` exists, otherwise a procedural illustration (9.2)
4. Badge row: **EH badge** (red skull, e.g. "EH −2", "EH → 1", "TIE −3", "END") and **Mitigation badge** (cog "POOL 10", skull "SACRIFICE 5 LP", urn "URN VOTE", hand "VOLUNTEER 2 LP")
5. **Effect text:** rendered from `digitalRuling` in a short form. Add a `shortText` field to cards.json (≤ 140 characters) for the `board` size; the full ruling shows in `zoom` and the Codex. Bold keywords (EH, LP, Influence, Sabotage, Infected…).
6. **Flavor text** in italic serif, low contrast
7. Card id in small type at the bottom (e.g. "CR-18")

A card back design (`<CardBack deck>`): a black linen texture, a crimson "ZERO COUNCIL" wordmark, and a brass gear in the middle. It's used for draw animations and the Blackout face-down state.

### 9.2 Procedural art for cards without a PNG
Each card has `artDirection` text. For the prototype, build a **procedural SVG art system** instead of leaving blanks: a set of ~16 reusable SVG motifs (gear, skull, valve, biohazard, radio, urn, padlock, crack, eye, hand, clock, flare, tunnel, monitor/flatline, scales, noose-pipe) composed over a stage-tinted gradient with noise and dripping vignettes. Map each card id to 1–2 motifs plus a tint in `src/ui/cardArtMap.ts` (choose motifs from the `artDirection` text). The result should look intentional, like a woodcut or etched stamp, not like placeholder art. Keep it swappable: once a real `public/art/cards/<ID>.webp` exists, it automatically replaces the procedural art.

### 9.3 Existing art
The design pack has individual PNGs. `cards.json` `artFile` already maps them:

| File | Card |
|---|---|
| Finale_01_Mandate_Exile.png | FIN-01 |
| Finale_02_Mandate_Sacrifice.png | FIN-02 |
| Finale_03_Apex_Mandate_Purge.png | FIN-03 |
| Finale_04_Game_Breaker_Total_Crucible.png | FIN-04 and CR-40 |
| BioSchism_01_Night_Terror.png | BS-01 |
| BioSchism_02_Permanent_Paralysis.png | BS-02 |
| BioSchism_03_Cancer_of_the_Soul.png | BS-03 |
| BioSchism_04_Hallucireality.png | CR-39 |
| FavStyle_01_The_Hollow_Echo_Woodcut.png | BS-07 |
| FavStyle_02_The_Blighted_Harvest_Propaganda.png | CR-16 |
| FavStyle_03_Signal_Interference_Watercolor.png | CR-09 (closest match: Static Interference) |
| FavStyle_04_Neural_Pathway_Decay_CyberGlitch.png | CR-23 (closest match: Neural Decay) |

Write a Node script `scripts/prepare-art.mjs` (use `sharp`) that, for each mapped PNG, **crops the illustration area only** (skip the printed title and rules text; start with the region from ~18% to ~62% of the height and make the crop box configurable per file in a JSON), resizes to 600 px wide, and saves `public/art/cards/<ID>.webp`. The multi-card sheets (Sheet_01–07) are reference only and must not be used in the game. Also turn `Central_Collapse_Tracker_Board.png`, `Secret_Action_Dial_Wheel.png` and `Faction_Mat_Template.png` into webp under `public/art/ui/` and use them as **textures/inspiration**. The actual UI must be built in HTML/SVG so it stays sharp and readable on phones.

---

## 10. Animations (Framer Motion; all durations in `fx/animations.ts`)
Every animation listens to engine events. All of them have a reduced-motion version (a fade), and Fast mode runs them at 2× speed.

| Event | Animation |
|---|---|
| Crisis draw | The card back slides from a deck stack at the top-right to the centre (300 ms, ease-out), then a **3D flip** (`rotateY` 180°, 450 ms, `perspective: 1000px`) showing the face. Catastrophic cards (EH ≤ −3, game breakers) add a 250 ms screen shake and a red vignette flash. |
| New stage | A full-screen title card, "STAGE III — THE TERMINAL PHASE", fades in letter by letter (1.2 s) with a heavy low rumble. |
| Card zoom | A shared-layout transition (`layoutId`) from the board card to the full-screen card; swipe down to dismiss. |
| EH change | The bar segments drain one by one (80 ms each) with crack lines; the skull marker shakes; the number counts down. Healing: the segments refill with a sickly green glow. At EH ≤ 5 the whole UI gets a slow red pulse. |
| Influence gain/loss | Cog icons fly between the supply (off-screen top) and the mat or a rival chip along a curved path (`motion.path`, 400 ms) and spin on arrival. |
| LP gained | A bone skull pops into the vault (scale 0 → 1.15 → 1). |
| LP destroyed | The skull **cracks** (an SVG crack overlay), splits into 2 halves, and falls and fades (500 ms). Hidden rivals' LP loss shows as an unknown skull cracking above their chip. |
| Contribute | Cogs fly into the Pool meter; the meter fills; when it reaches the threshold it locks with a bolt-slam and a green flash. |
| Dial | Real-time rotation following the finger; a spring snap to the sector; Hold-to-Seal fills a ring and then the dial slams face-down. |
| Reveal | All dials flip together (staggered 40 ms); rival mini dials enlarge briefly. |
| Fizzle | A grey "FIZZLED" ink stamp rotates in at −8°. |
| Blight cube | A translucent purple cube drops onto the mat, pulses, and drips. |
| Embargo | A padlock and chain swing across the dial. |
| Exile | The faction mat **flips face-down** (rotateX 180°) and its colour drains to grey. |
| Deal note | A torn-paper card slides up; accept = a wax-seal stamp; betrayal = the note rips in half with a red "BETRAYED" stamp. |
| Urn vote | Ballot slips fall into the urn and disappear; the count pops ballots out one at a time with a tally; the result gets a brass stamp. |
| Crucible fist reveal | Clenched-fist icons shake, then open together; skulls arc into a dark pit at the bottom of the screen. |
| Deletion | The portrait/chip gets an RGB-split glitch (3 frames), a horizontal scan-line tear, then burns to ash particles (CSS/SVG, ~900 ms). |
| Turn advance | The gear rolls to the next slot with a rotation and a clank. |

Performance: animate only `transform` and `opacity`; use `will-change` sparingly; aim for 60 fps on a mid-range Android (test with CPU throttling ×4 in DevTools).

---

## 11. Sound effects (Web Audio API, synthesized; `src/audio/sfx.ts`)
Create one shared `AudioContext`, **unlocked on the first user tap** (iOS needs this). Master gain plus SFX/ambience gains are controlled from Settings. Every effect is a small function that builds oscillators/noise buffers and envelopes; no audio files are needed. (Later each one can be replaced with a file through the same `play(name)` API.)

| Name | Recipe (starting point; tune by ear) | Used on |
|---|---|---|
| `cardDraw` | band-passed white noise sweep 400→2000 Hz, 180 ms, fast attack | the card slides out |
| `cardFlip` | 2 short noise clicks 60 ms apart, high-passed at 1.5 kHz | the flip |
| `catastrophe` | sine 55 Hz with a pitch drop to 35 Hz over 1.2 s, plus distorted noise rumble | catastrophic crisis, new stage |
| `ehDrop` | triangle 220→110 Hz glide, 300 ms, with a short distortion; repeat per 2 EH | EH loss |
| `ehHeal` | two soft sine notes going up (a 5th), 400 ms | EH gain |
| `cogClink` | 2 detuned square waves (~2.1 kHz and ~2.9 kHz) with a 70 ms exponential decay and a random ±8% pitch | Influence moves (throttle to ≤ 8 per 100 ms) |
| `skullForge` | a low hollow knock: sine 180 Hz, 120 ms, plus a noise tick | LP gained |
| `skullCrack` | noise burst 40 ms high-pass + sine thump 90 Hz 150 ms | LP destroyed |
| `dialTick` | 1 ms square click at 3 kHz, very short | each sector passed |
| `dialSeal` | sine 70 Hz thump 200 ms + metallic ring (sine 900 Hz with a slow decay) | dial sealed |
| `revealAll` | a reversed-cymbal-like noise swell 600 ms then a click | the simultaneous reveal |
| `poolLocked` | 3 rising square blips + a bolt thump | mitigation reached |
| `poolFailed` | a dissonant minor-2nd sine pair, 800 ms, detuned | mitigation failed |
| `blight` | a wet low-pass noise "gloop" with a pitch-bend down | cube added |
| `ballotDrop` | a paper flick (noise 30 ms) + a muffled thud | ballots |
| `toll` | a bell: sum of inharmonic sines (1, 2.76, 5.4 × 220 Hz) with a 2.5 s decay | vote result, deletion |
| `glitch` | bit-crushed noise (a ScriptProcessor/AudioWorklet or a sample-and-hold) with random 20 ms gaps | deletion, Neural Decay, Night Terror |
| `timerTick` / `heartbeat` | a low double thump each second in the last 10 s of Whisper | Whisper timer |
| `vaultDoor` | a long metallic thud: noise + 50 Hz sine + reverb (ConvolverNode with generated decaying-noise impulse) | title, game start, Crucible |
| `staticCrackle` | sparse random noise bursts | the radio intro, Dead Frequency |
| `uiTap` | a very soft 1 ms click | buttons |

**Ambience loop** (`ambience.ts`): a low drone (two detuned sines at 41 and 41.7 Hz through a low-pass), plus filtered brown noise as an "air recycler hum", plus random far-off metallic clanks every 8–20 s. Ambience gets a little darker each stage (lower the filter cutoff and add a slow heartbeat in Stage IV). In the Crucible: total silence except heartbeats.

Respect the mute switch in Settings; pause the AudioContext when the app goes into the background.

---

## 12. Haptics, persistence, PWA
- **Haptics:** `navigator.vibrate` where supported (Android). Patterns: dial snap 5 ms, seal 30 ms, EH loss [20,40,20], deletion [60,40,120]. On Capacitor (M8) switch to `@capacitor/haptics`. There's a Settings toggle.
- **Persistence:** save the whole `GameState` + seed to `localStorage` after every phase. *Continue* on the title screen resumes. Bump the version key if the state schema changes and throw away saves that don't match.
- **PWA:** manifest (name "Zero Council", theme #0b0a09, portrait orientation lock, maskable icon made from the urn sigil), offline cache of all assets.

---

## 13. Milestones (build in this order; finish each one, with tests passing, before the next)

| # | Milestone | Done when |
|---|---|---|
| **M0** | Scaffold: Vite/React/TS, Zustand, Framer Motion, Vitest, PWA, fonts, the folder layout, data files loaded with runtime validation (zod) | `npm run dev` shows a styled placeholder title screen at 390×844; the data validation test passes for all 71 cards and 6 factions |
| **M1** | Engine core: setup, seats, stage piles, the 5 actions, costs, EH, generic pool mitigation, statuses, the Crucible, end conditions, event stream, seeded RNG | Unit tests for actions/costs/ties/Crucible; a game of random-action AIs runs from start to the Crucible headlessly |
| **M2** | **All 71 card handlers** + votes/Urn + all 6 faction abilities + the deal data model and promise checking | A test per card id; the registry completeness assertion; the 500-game random sim has no errors or invariant violations |
| **M3** | AI: personalities, beliefs, action utility, contribute logic, voting, Crucible bids, Whisper deal generation and acceptance, flavor lines | `npm run sim` prints the balance report; AIs mitigate a reasonable share of pool crises (aim for 40–70% on Normal); no faction has a Survivor rate above 30% or below 8% across 1000 six-player games (if one does, report it; don't silently change the design) |
| **M4** | Mobile UI: all screens in §7 wired to the engine; the human can play a full game; the Codex shows all 71 cards with CardView + procedural art | A full game can be played on a 360×740 viewport by touch only; Lighthouse PWA and accessibility scores ≥ 90 |
| **M5** | Animations (§10) + the event playback queue with skip/fast | Every event type has an animation; reduced-motion works |
| **M6** | Sound (§11) + ambience + haptics + Settings | Every SFX in the table can be heard and the mute switch works; audio unlocks on iOS Safari |
| **M7** | Polish: tutorial, the title radio intro, the end screen and stats, save/resume, the art prep script, a balance pass using sim data (only changes to `config.ts` values) | A new player can finish a game without reading the rules; Continue works after the app is killed |
| **M8** (later) | Capacitor iOS/Android wrap, splash, icons, native haptics, status bar styling | Builds run on a device |

After each milestone, append a short entry to `docs/CHANGELOG.md` and list any new **design questions** in `docs/DESIGN_QUESTIONS.md`. Don't invent new rules silently; pick the most reasonable reading, implement it behind a `config.ts` flag, and log it.

---

## 14. Known design gaps (already settled here; the designer should review them)
1. **Deck depth vs 10 turns:** settled by drawing per stage by turn (§2.2).
2. **No reason to protect EH:** settled by the Total Collapse penalty (§2.3), which can be turned off.
3. **EH impact timing:** settled by the `timing` field (`unmitigated` for pool cards).
4. **Starting resources:** the generic 5/3 vs faction pools → the faction pools are used.
5. **Undefined active ability frequency/cost:** Whispered Paranoia (2 Inf, 1/turn) and Subpoena (free, 1/turn) are defaults.
6. **Finale deck timing:** replaces the Turn 9 Mandate (§2.2).
7. **CR-40 and FIN-04 are duplicates.** Both are kept; consider rewriting one.
8. **MAN-20 Zero Consensus** doesn't say what happens on success → default: the target loses 2 LP.
9. **Neurological vs biological Blight:** cubes are split into `bio` (drains LP) and `neuro` (drains Influence). Only BS-04 gives neuro cubes right now.
10. **Oxygen Embargo** (double cost) is referenced but no card triggers it; the flag is kept for future cards.
11. **LP pledges on failure** (CR-26): refunded by default (`lpPledgeRefundOnFail`).
12. **The card art text differs from the CSV** in several places; the CSV/cards.json win.

---

## 15. Definition of done for the prototype
- A player on a phone can install the PWA, pick any faction, play a complete 10-turn game against 5 AIs with every card able to appear, go through the Mandates and the Crucible, and reach an end screen.
- All 71 cards render correctly in the Codex and in play, with working effects.
- Sounds and animations play for every event, can be skipped or sped up, and respect reduced motion and mute.
- `npm test` passes (including the 500-game sim); `npm run sim` prints the balance report.
