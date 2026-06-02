# B2B Under $100M — Focus & Anti-Focus

> Version: 1.0 — 2026-05-18
> Origin: founder question — "what to do and not do" given segment is B2B <$100M companies.
> Goal: ruthless prioritization. Better to ship 6 deep features that win than 30 features that are mid.

---

## The segment

B2B companies under $100M revenue:
- Founder OR 1-3 marketers wearing 5 hats
- Tool budget: **$100–2,000/mo** (NOT $20k/mo enterprise)
- Need results in **30-60 days**, not 12 months
- Hate "talk to sales" / hate enterprise learning curves
- B2B → **LinkedIn-first**, blog-driven, ICP very specific (CTO, Head of Eng, VP Sales, CMO)
- Often technical (SaaS, dev shop, consultancy, agency, fintech, infra)
- Self-serve onboarding, no implementation team

This segment is **HubSpot's old sweet spot** that they abandoned moving upmarket. **Sintra and Jasper IQ** are closest peers. **Ahrefs/Semrush** are data tools — too expensive + not workflow.

---

## The 3-question screen

Before shipping anything, ask:

1. **Critical for a B2B <$100M founder to ship growth?** No → DROP.
2. **Can we be uniquely good at this?** No → DEFER.
3. **Does a big tool already dominate?** Yes → don't compete head-on; find adjacent angle.

A feature passes only if: critical + unique + we have a real wedge.

---

## ✅ SHIP DEEP (critical + unique + we can win)

| Feature | Why we win | Block | Status |
|---|---|---|---|
| **Research Hub: multi-source + provenance** | Every other tool is point or one-shot. Bundling source toggles (URL+GSC+KB+uploads+competitors+vector) into one surface is unique. Multiplies every downstream agent. | New | Proposed |
| **GEO/LLMO tracking** | Only growing channel (86.83% search has AI Overview). Ahrefs/Semrush charge $99/mo add-on; we bake in. | 1 | ✅ shipped |
| **Brand IQ auto-extract** | ContentShake has 50 voices but no auto-extract from URL+samples in one click. | 2 | ✅ shipped |
| **AI Employees with personality + RAG + DM chat** | Sintra has 12 employees but no real publish + thin memory. We have RAG + KPI dashboards + real action. | 3 | ✅ shipped |
| **Content Editor real-time grader** | Bundled. Surfer = $99-219/mo standalone; we include. | 4 | ✅ shipped |
| **Campaign Launcher (1-click multi-channel)** | **No tool in the audit has this.** One keyword → blog + images + WP + LinkedIn + GEO seed. | 8 | ✅ shipped |
| **WordPress publish + featured image** | 43% of all websites run WP. Most B2B SMB sites = WP. Critical, table stakes. | 8 | ✅ shipped |
| **Growth Score + Daily Missions** | **No competitor has gamification for founders.** Unique habit-formation primitive. | gamification | ✅ shipped |
| **Agent Evolution Loop** | **Nobody ships this.** Per-agent prompt A/B with outcome scoring = long-term moat. | 5 | TODO |
| **LinkedIn-first publishing (articles + posts)** | #1 channel for B2B. Currently we draft posts; need LinkedIn Article API + scheduling. | extend social | 🟡 partial |
| **B2B persona presets** (CTO / Head of Eng / VP Sales / CMO) | Speeds up Brand IQ setup for B2B. Generic personas don't fit B2B. | new | TODO |

These 11 features = **the platform**. Everything else is supporting.

---

## ⛔ DON'T BUILD (commodity, wrong segment, or unwinnable)

| Feature | Why skip | Who owns it |
|---|---|---|
| **Full CRM (deal stages + forecasting + reporting)** | HubSpot/Pipedrive own this. Solo founders don't need deal-stage Kanban for first 50 customers. | HubSpot, Pipedrive, Attio |
| **Backlink database** | Ahrefs took 10 years + $100M+ to build. Never compete. | Ahrefs, Semrush, Moz |
| **TikTok / IG deep automation** | B2B SMB rarely converts via these. Low ROI. | Buffer, Later |
| **Real video rendering (Runway/Pika/Veo)** | Too expensive ($0.50-2/clip), B2B SMB doesn't need it. Defer indefinitely. | Runway, Pika |
| **Programmatic SEO at 10k+ pages** | Penalty risk + B2B SMB needs depth not volume. | Ryze, Harbor SEO |
| **Multi-language at scale** | Most B2B SMB English-only. Add Vietnamese as secondary moat only. | Smartling, Weglot |
| **White-label agency platform** | Totally different segment (agencies sell our tool). Distracts. | AgencyAnalytics, HighLevel |
| **Voice channel (Twilio + Whisper)** | B2B SMB doesn't need inbound voice. | Twilio, Aircall |
| **Studio: no-code agent builder** | Premature. B2B SMB wants pre-built personas, not to build their own. | Relevance AI, Lindy |
| **Complex attribution / funnel visualization** | Plausible / Fathom / Fireflies are enough at this segment. | Plausible, Fathom |
| **Enterprise SOC2 / compliance dashboards** | Wrong segment. Founder-led companies don't need it until $50M+. | OneTrust, Vanta |
| **Real-time live cursors / Google-Docs-style collab** | Solo founders don't collaborate live. Async sharing link is enough. | Notion, Google Docs |
| **MCP server interface** | Cool but B2B SMB founder doesn't know what MCP is. Defer. | Writesonic |

The discipline of saying "no" to these is **more important than the discipline of saying yes** to the things in the SHIP DEEP table.

---

## 🔄 RECONSIDER in the build plan

### Block 7 — Outcome-Based Pricing → **DEFER / SIMPLIFY**
- HubSpot can do per-resolution billing because they have 200k customers + sales team.
- B2B SMB founders prefer flat $X/mo, predictable.
- **Action**: ship "credit transparency" (1 launch = X credits visibly) instead of outcome billing. Defer real outcome billing 12 months.

### Block 9 — Programmatic SEO + Studio → **CUT IN HALF**
- Programmatic SEO at scale: **DROP** entirely (penalty risk + wrong segment).
- Studio (no-code agent builder): **DEFER** (overengineering).
- **Replace with**: **B2B Playbook Templates** — preset Brand IQ + persona + GEO prompt set + content calendar for each B2B sub-vertical (SaaS / dev shop / consultancy / fintech / agency / marketplace). Onboarding speed wedge.

### Block 6 — Omnichannel → **REFOCUS**
- Currently shipped FB Messenger (good for Vietnamese market).
- For B2B <$100M global: **prioritize LinkedIn DM** over WhatsApp/IG.
- Keep Zalo + FB Messenger as Vietnamese-market secondary moat.

### Real video rendering → **DROP from Block 8 v2**
- B2B SMB doesn't need video at the cost it requires (~$0.50/clip).
- LinkedIn carousel + slide PDF would deliver more ROI for less.
- **Replace with**: **LinkedIn carousel / PDF auto-generation** (much cheaper, very B2B-native).

---

## 📌 Re-prioritized ship order

After this analysis, the next 4 blocks should be:

1. **Research Hub Phase 1** (multi-source + provenance) — multiplier for every existing feature; ~1200 LOC, 1 session.
2. **B2B Persona Presets + LinkedIn Article API extension** — segment-specific wedge; ~500 LOC.
3. **Block 5 — Agent Evolution Loop** (MOAT — nobody has it); ~1100 LOC.
4. **Research Hub Phase 2** (Voice library + term blacklist + shareable review link); ~1300 LOC.

Defer indefinitely: Block 7 (replace with credit transparency), Block 9 programmatic (replace with B2B Playbook Templates), real video render, IG/TikTok deep, white-label, voice channel.

This trajectory keeps us **deep and differentiated for B2B <$100M** instead of broad and mid for everyone.

---

## The positioning sentence

> "1Person is the AI workflow platform for B2B founders under $100M. Replace your 7-tool stack (Ahrefs + Surfer + Jasper + Buffer + HubSpot Starter + Midjourney + Pictory = $900-1200/mo) with one opinionated platform that researches your market AND your customers, drafts blog posts graded live against the top-10 SERP, generates hero images (Banana) and short videos (in-house engine), publishes to WordPress + LinkedIn + social with one click, tracks ChatGPT/Claude/Perplexity citations on your pages, and lets you DM seven named AI employees who actually run your marketing — for $99-299/mo. Not for enterprises. Not for consumer brands. Not for agencies. Founders who sell to other businesses."

If this sentence doesn't fit a feature, don't ship the feature.

### What we already ship (be honest about it)
- **Content + SEO**: blog generator + Content Grader (Surfer-style) + GEO tracker + GSC client + SERP scraper
- **Visuals**: image-generator (DALL-E / Gemini / Banana / Banana Pro) + video-engine (script + scenes) + asset-generation-service
- **Publish**: WordPress (cms-integration) + FB Messenger + Campaign Launcher 1-click multi-channel
- **Intelligence**: Brand IQ + AI Employees (7) + Vector RAG (Block 3) + business-context injection
- **Ops**: Gamification (Growth Score / Missions / Streaks) + Omnichannel inbox + Lead capture
- **Brain Hub** (in flight, Phase A this session) — ties it all together with source-agnostic ingestion + reactive Brain

---

## Open decisions for founder

1. **Approve this focus?** If yes, I'll update `build-now-plan.md` to reflect the re-prioritization.
2. **Drop or keep Block 7 (outcome billing)?** Recommend drop.
3. **Drop or keep Block 9 (programmatic SEO + studio)?** Recommend replace with B2B Playbook Templates.
4. **Add Block 10 — LinkedIn-first publishing (articles + scheduling + carousel)?** Recommend yes — closest to the B2B wedge.
5. **Pricing**: $49 solo / $199 small team / $499 ship-20-articles-a-month / no enterprise tier. Confirm?

---

## Liên kết

- [competitive-research-2026.md](./competitive-research-2026.md) — full landscape + Appendix A (13-tool UX audit)
- [2027-product-vision.md](./2027-product-vision.md) — north star (will need a B2B re-cut)
- [research-hub-design.md](./research-hub-design.md) — the Phase 1 multi-source redesign
- [build-now-plan.md](./build-now-plan.md) — will be updated after founder approves this focus
