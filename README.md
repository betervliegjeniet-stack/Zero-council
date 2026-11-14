# Zero Council — mobile single-player prototype

A grimdark council-survival card game for one player against 3 to 5 AI Councilors. Ten turns of crisis,
deals and secret actions, then the Crucible. There are no winners.

## Play it

```
npm install
npm run dev -- --host        # open the "Network" URL on your phone (same Wi-Fi)
```

To try the installable app (Add to Home Screen, works offline):

```
npm run build && npx vite preview --host
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Type-check and build the PWA into `dist/` |
| `npm test` | 216 tests: every card, votes, abilities, deals, AI, and 500+ simulated games |
| `npm run sim -- --games 1000` | AI-vs-AI balance report (`--players`, `--difficulty`, `--config '{...}'`, `--ai '{...}'`, `--verbose`) |
| `node scripts/prepare-art.mjs` | Rebuild card art from `design-pack/plates` and any `public/art/cards/<ID>.webp` you add |

## Where things are

- `docs/SPEC.md` — the build specification (source of truth).
- `docs/DESIGN_QUESTIONS.md` — every ruling made where the spec was silent, the balance findings and the balance pass.
- `docs/CHANGELOG.md` — what each milestone added.
- `docs/ART_PROMPTS.md` — image prompts for the 55 cards that still use vector art.
- `data/cards.json`, `data/factions.json` — the 71 cards and 6 factions.
- `src/engine/` — the rules engine: pure TypeScript, no React or DOM. `config.ts` holds every tunable number.
- `src/engine/ai/` — the AI Councilors.
- `src/ui/`, `src/store/`, `src/fx/`, `src/audio/` — screens, game store, animations, synthesized sound.

## Tuning

Every rule number, balance lever and AI weight is in `src/engine/config.ts`. Change a value, run
`npm run sim -- --games 1000`, and compare the report.
