# Evidence & recommendations

## Evidence contract

Analysis compares two explicit windows (default: latest 7 days vs preceding 7
days). Each finding includes metric, baseline/current, absolute/percentage
delta, windows/timezone, source, and sufficiency.

`daily_budget` is a configuration metric; `spend` is a result. If a budget
raise also increases spend, present one budget finding and spend as related
impact. A CTR decline is a fact; creative fatigue, targeting, or delivery are
hypotheses until lower-level evidence supports them.

## AI input boundary

```text
Facts: structured Meta Insights evidence
Brand context: active Brand IQ
Reasoning frameworks: ads + product-marketing + ad-creative skills
Brief context: objective, Ad Set context, current headline/copy/CTA/format
```

Only the first line supports a performance claim. The prompt must not invent
bounce rate, revenue, CPA, ROAS, audience quality, testimonials, proof,
discounts, or product claims. With campaign-level evidence, it must state that
the cause cannot isolate audience, delivery, or a specific creative.

## Recommendation lifecycle

```text
analysis → recommended → saved | rejected | handled_manually
```

The output is a brief only: possible cause (hypothesis), a safe next step, and
an optional test of one synced creative. The model selects an evidence-allowed
action type and an existing creative plus test type; the server renders the
user-facing action and creative direction from those records. This prevents
unverified performance or product claims from becoming generated copy. If the
model cannot meet that contract after one retry, no recommendation is persisted.
It is never a Meta action or outcome claim.
