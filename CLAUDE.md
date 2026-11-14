# Zero Council Mobile
- docs/SPEC.md is the source of truth. Read it fully before starting work.
- data/cards.json `digitalRuling` overrides any printed card text or card artwork text.
- Engine code (src/engine) must stay pure TypeScript with no React/DOM/audio imports.
- Build milestone by milestone (SPEC §13). Run `npm test` before you call a milestone done.
- Never silently invent rules: put a flag in src/engine/config.ts and log it in docs/DESIGN_QUESTIONS.md.
- Mobile-first: test layouts at 360x740, 390x844, 430x932.
