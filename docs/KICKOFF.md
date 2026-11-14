# How to build Zero Council Mobile with Claude Code

## 1. Set up the folder (one time)
```
mkdir zero-council && cd zero-council
mkdir -p docs data design-pack
```
Copy in:
- `ZERO_COUNCIL_MOBILE_SPEC.md` → `docs/SPEC.md`
- `cards.json` and `factions.json` → `data/`
- the full contents of `Zero_Council_Master_Design_Pack.zip` → `design-pack/` (the individual card PNGs in `04_Sample_Card_Artworks/Individual_Cards/` and the images in `05_Printable_Prototype_Assets/` are the ones the game uses)

Create `CLAUDE.md` in the root with:
```
# Zero Council Mobile
- docs/SPEC.md is the source of truth. Read it fully before starting work.
- data/cards.json `digitalRuling` overrides any printed card text or card artwork text.
- Engine code (src/engine) must stay pure TypeScript with no React/DOM/audio imports.
- Build milestone by milestone (SPEC §13). Run `npm test` before you call a milestone done.
- Never silently invent rules: put a flag in src/engine/config.ts and log it in docs/DESIGN_QUESTIONS.md.
- Mobile-first: test layouts at 360x740, 390x844, 430x932.
```

Then run `claude` in that folder.

## 2. Prompts to paste, one milestone at a time

**Prompt 1: plan**
> Read CLAUDE.md, docs/SPEC.md, data/cards.json and data/factions.json. Don't write code yet. Give me a short implementation plan for milestones M0–M2, including the TypeScript types for GameState, Intent, GameEvent and PendingDecision, and list anything in the spec you think is contradictory.

**Prompt 2: M0 + M1**
> Implement M0 and M1 from docs/SPEC.md §13. Include the Vitest tests listed there. Finish by running `npm test` and a headless random game, and show me the output.

**Prompt 3: M2 (all 71 cards)**
> Implement M2: a handler for every one of the 71 cards following its `digitalRuling`, the Black Urn voting system, all 6 faction abilities, and deal promise checking. Write one test per card id. Add the registry completeness assertion. Run the 500-game sim test.

**Prompt 4: M3 (AI)**
> Implement M3: the AI Councilors as described in SPEC §5, including Whisper deal behaviour and faction flavor lines in the GDD's grimdark voice. Then run `npm run sim -- --games 1000` and show me the balance report. Don't change rules to fix balance; put the findings in docs/DESIGN_QUESTIONS.md.

**Prompt 5: M4 (mobile UI)**
> Implement M4: every screen in SPEC §7 and the CardView with procedural SVG art (§9) so all 71 cards render in the Codex. Run the art prep script for the existing PNGs. Make sure a full game is playable by touch at 360x740.

**Prompt 6: M5 + M6 (animations and sound)**
> Implement M5 and M6: the event playback queue, every animation in SPEC §10, every synthesized sound in §11, the ambience loop, haptics, and Settings. Respect reduced motion and mute.

**Prompt 7: M7 (polish)**
> Implement M7: tutorial, the radio intro, the end screen with stats, save/resume, and a balance pass that only changes config.ts values, backed by sim data.

## 3. Testing on your phone
- `npm run dev -- --host`, then open the shown network URL on your phone (same Wi-Fi).
- Or `npm run build && npx vite preview --host` to test the PWA install ("Add to Home Screen").

## 4. Things you should decide as the designer
Look at SPEC §14 "Known design gaps". Each one has a sensible default, but they're your calls. The most important are the **Total Collapse penalty** (without it, players have little reason to protect Earth Health) and **drawing crisis cards by stage per turn** (without it, only Stage I cards would ever come up in a 10-turn game).
