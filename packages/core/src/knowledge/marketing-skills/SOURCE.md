# Marketing Skills — Source & Attribution

The `SKILL.md` files in this directory are **adapted from**
[`coreyhaines31/marketingskills`](https://github.com/coreyhaines31/marketingskills)
by Corey Haines, used under the **MIT License** (see `LICENSE` in this folder).

## What we vendored

- 45 `SKILL.md` framework files (the lean playbooks). We did **not** vendor the
  `references/` deep-dive subfolders or the `evals/` — those can be pulled
  per-skill when a feature needs them (see the integration tracker).
- We kept the content in **English** (founder decision 2026-05-24): this is the
  internal knowledge layer for agents. End-user output language follows Brand IQ.

## How it's used (do NOT edit these files by hand for runtime)

1. These `.md` files are the **source of truth** for marketing knowledge.
2. `packages/core/scripts/generate-skill-knowledge.ts` reads them and emits
   `packages/core/src/knowledge/skill-knowledge.generated.ts` (a TS module — safe
   for both `tsx` dev and `tsup` prod bundles; no filesystem reads at runtime).
3. Run `pnpm --filter @1person/core gen:skills` after changing any `SKILL.md`.
4. Services inject the framework via `getSkillKnowledge(name)` from `@1person/core`.

## License compliance

The MIT license requires the copyright notice be retained — it lives in
`./LICENSE`. We may modify, translate, and sublicense within 1Person.

> Tracking: `docs/strategy/marketingskills-integration-tracker.md`
