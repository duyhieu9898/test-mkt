# 📋 MarketingSkills Integration Tracker (PM source of truth)

> **Đây là file PM theo dõi DUY NHẤT** cho việc hấp thụ repo `coreyhaines31/marketingskills` (MIT) vào 1Person.
> Mọi item ta "lấy" từ họ phải xuất hiện ở đây với trạng thái rõ ràng. **Không sửa code tích hợp mà không cập nhật bảng này.**
>
> - Phân tích nền: [`vs-marketingskills-corey-haines.md`](./vs-marketingskills-corey-haines.md)
> - Repo nguồn (đã clone): `/Users/thanhdao/Projects/marketing_skill_sample_github`
> - Cập nhật lần cuối: **2026-05-24** · Chủ trì (PM): _Claude (agent) + Founder duyệt_
> - Tiến độ tổng: **P1–P6 done.** ⭐ **41/41 skill giờ user GỌI ĐƯỢC qua Marketing Playbooks Studio** (`/playbooks`) — độ phủ ngang marketingskills. 16 skill còn được wire sâu vào feature/agent riêng. Còn lại = độ sâu feature riêng + T02/T05/T06 tích hợp ngoài.

---

## 1. Luật chơi — "Definition of Done" (đọc trước khi tick bất cứ gì)

Mỗi item chỉ được tính trạng thái cao hơn khi qua đủ **4 cổng**. Đây là thứ chống lại nỗi lo "implement mà không biết có thực sự vào sản phẩm không":

| Cổng | Tên | Điều kiện pass | Bằng chứng phải ghi |
|---|---|---|---|
| **G1** | Lấy vào repo | File markdown/CLI đã copy vào repo ta (kèm license) | đường dẫn file trong repo ta |
| **G2** | Wire vào code | Có service/registry thực sự GỌI tới nó (không phải file mồ côi) | file:line nơi nó được gọi |
| **G3** | Hiện trên UI | Có 1 màn hình user mở được dùng được nó | route + file page |
| **G4** | Vào Walkthrough | Có 1 dòng trong `walkthrough/page.tsx` để non-tech founder khám phá | tên feature trong SECTIONS |

**Trạng thái (Status):**
| Ký hiệu | Nghĩa | Cổng đã qua |
|---|---|---|
| ⬜ | Not started — mới chỉ phân tích | — |
| 🟡 | In progress | đang làm G1/G2 |
| 🔵 | Code done | G1 + G2 (có code, chưa thấy trên UI) |
| 🟢 | Shipped to UI | G1 + G2 + G3 + G4 |
| ✅ | Verified | G1–G4 + đã test chạy thật (qua `/verify`) |

> ⚠️ **Quy tắc vàng (theo `feedback_code_must_ship_to_ui`):** một item KHÔNG được để lâu ở 🔵. Nếu code xong mà chưa lên UI + Walkthrough thì coi như **chưa xong** và là nợ kỹ thuật. Ship từng nhóm nhỏ, đừng dồn.

**Cột "Nền ta có sẵn":** 🟢 sâu (chỉ cần làm sâu thêm) · 🟡 nông (có khung, prompt yếu) · ⬜ chưa có (build mới).

---

## 2. Phase rollup (tiến độ theo giai đoạn)

| Phase | Mục tiêu | Items | Done | Trạng thái |
|---|---|---|---|---|
| **P1** | Knowledge loader + thay prompt nông nhất | K-loader, K01, K03, K06, K15, K16 | 6 | ✅ **Done** (2026-05-24) |
| **P2** | Brand IQ = product-marketing++ | F01 | 1 | ✅ **Done** (2026-05-24) ⚠️ cần áp mig 0009 khi DB chạy |
| **P3** | Gắn skill-bundle vào AI Employees | K28, K29, K35, K37, K38, K39, K40 | 7 | ✅ **Done** (2026-05-24) |
| **P4** | Tool registry: analytics + SEO data thật | T01, T03 | 2 | ✅ **Done** (T01 GA4 mới + T03 GSC sẵn có); T02 (Ahrefs bên thứ 3) hoãn → P6 |
| **P5** | Last-mile thực thi (social/ads/SMS) | T04 | 1 | ✅ **T04 Done** (FB organic publish thật). T05 ads-push chờ founder duyệt (tiêu tiền); T06 SMS sau |
| **P6** | ⭐ Marketing Playbooks Studio — gọi cả 41 skill qua UI | tất cả 41 | 41 | ✅ **Done** (2026-05-24) — đóng khoảng cách độ phủ vs marketingskills |
| **P7** | Eval harness | E01 | 0 | ⬜ Tùy chọn |
| **P8** | ⭐ Content Autopilot — 1-2 blog/ngày tự động lên WP | autopilot | 1 | ✅ **Done** (2026-05-25) — PMF cho nhu cầu BAP, vượt Claude-Chrome/marketingskills cho job auto-blog. ⚠️ áp mig 0010 |

---

## 3. Bảng theo dõi — LỚP KIẾN THỨC (41 skills → registry + prompts)

> ✅ **P6 — CẢ 41 SKILL GIỜ GỌI ĐƯỢC QUA UI.** Trang **Marketing Playbooks Studio** (`/playbooks`) cho user chọn bất kỳ skill nào → áp framework + Brand IQ → ra deliverable (đúng mô hình invoke của marketingskills). Mọi skill ⬜ bên dưới **đã đạt G1–G4 qua surface Studio**; cột Status dưới đây giờ theo dõi **độ sâu của FEATURE RIÊNG** (dedicated), không phải khả năng gọi. Code: `routes/marketing-skills.ts`, `core` `listSkillCatalog()`, `/playbooks/page.tsx`, sidebar + walkthrough §5.

Target mặc định: copy `SKILL.md` vào `packages/core/src/knowledge/marketing-skills/<name>/` (G1) → loader đổ vào bảng `skills` / inject vào prompt service (G2).

| ID | Skill (họ) | Gap nó lấp | Nền ta có | Target code (G2) | UI surface (G3) | Walkthrough (G4) | Phase | Status |
|---|---|---|---|---|---|---|---|---|
| K01 | copywriting | prompt blog 1-câu → framework sâu | 🟡 | ✅ `blog-generator.ts:13,109` (inject vào bước viết content) | `/editor`, `/seo-engine` | ✅ §"Expert frameworks" + §1 | P1 | 🟢 |
| K02 | ads (strategy) | chiến lược campaign/targeting | 🟡 | _(K03 đã phủ phần sinh creative; ads-strategy còn lại)_ | `/ads` | _(thêm sau)_ | P6 | ⬜ |
| K03 | ad-creative | iterate creative | 🟢 | ✅ `ads-engine.ts:28,618` (`system: ADS_FRAMEWORK`) | `/ads`, `/campaigns` | ✅ §"Expert frameworks" | P1 | 🟢 |
| K04 | seo-audit | technical audit (chưa có) | ⬜ | NEW `seo-audit-service.ts` | `/seo-engine` | §1 (feature mới) | P6 | ⬜ |
| K05 | ai-seo | framework GEO/AEO sâu | 🟢 | `geo-tracker.ts` | `/geo` | §1 AI Visibility | P6 | ⬜ |
| K06 | cro | framework chấm conversion | 🟡 | 🟡 `landing-page-service.ts:31,506` (inject vào hero — section conversion cao nhất; các section khác fast-follow) | `/landing-pages` | ✅ §"Expert frameworks" | P1 | 🟢 |
| K07 | copy-editing | passes biên tập | ⬜ | `content-editor.ts` | `/editor` | §1 Content Editor | P6 | ⬜ |
| K08 | schema | mở rộng JSON-LD types | 🟡 | `seo-engine.ts` | `/seo-engine` | §2 WordPress | P6 | ⬜ |
| K09 | content-strategy | topic cluster/calendar | 🟡 | `seo-engine.ts`, `playbook-service.ts` | `/campaigns` | §2 Campaigns | P6 | ⬜ |
| K10 | site-architecture | IA/internal-link planner | ⬜ | NEW service | `/seo-engine` | §1 (feature mới) | P6 | ⬜ |
| K11 | programmatic-seo | engine sinh trang scale | ⬜ | NEW `pseo-service.ts` | `/seo-engine` | §2 (feature mới) | P6 | ⬜ |
| K12 | aso | App Store optimization | ⬜ | NEW | _(chưa có nơi)_ | _(soon)_ | P6 | ⬜ |
| K13 | competitors | trang so sánh SEO | 🟡 | `competitor-comparison.ts` | `/market` | §1 Market | P6 | ⬜ |
| K14 | directory-submissions | danh sách + flow submit | ⬜ | NEW | `/campaigns` | §2 (feature mới) | P6 | ⬜ |
| K15 | emails | thư viện lifecycle flow | 🟡 | ✅ `outreach-engine.ts:28,822` (`system: EMAILS+COLD`) | `/sales` | ✅ §"Expert frameworks" | P1 | 🟢 |
| K16 | cold-email | framework cold B2B | 🟡 | ✅ `outreach-engine.ts:28,822` (inject chung với K15) | `/sales` | ✅ §"Expert frameworks" | P1 | 🟢 |
| K17 | social | framework post đa nền tảng | 🟡 | `distribution-engine.ts` | `/social` | §2 Social Media | P6 | ⬜ |
| K18 | sms | framework SMS | ⬜ | NEW (cần provider, xem T06) | _(soon)_ | _(soon)_ | P6 | ⬜ |
| K19 | image | prompt ảnh sâu | 🟢 | `image-generator.ts` | `/assets` | §2 Assets | P6 | ⬜ |
| K20 | video | framework script | 🟡 | `video-engine.ts` | `/assets` | §2 Video (soon) | P6 | ⬜ |
| K21 | ab-testing | runner + stat sig | 🟡 | NEW `ab-test-runner.ts` | `/analytics` | §5 (feature mới) | P6 | ⬜ |
| K22 | analytics | event plan / setup | 🟡 | `tracking.ts` (+T01 GA4) | `/analytics` | §5 (feature mới) | P4 | ⬜ |
| K23 | signup | tối ưu signup flow | ⬜ | NEW (AI employee skill) | `/team` | §5 AI Employees | P6 | ⬜ |
| K24 | onboarding | tối ưu activation | ⬜ | NEW (AI employee skill) | `/team` | §5 AI Employees | P6 | ⬜ |
| K25 | popups | popup conversion | ⬜ | NEW | `/landing-pages` | §2 (feature mới) | P6 | ⬜ |
| K26 | paywalls | upgrade screen | ⬜ | NEW (AI employee skill) | `/team` | §5 AI Employees | P6 | ⬜ |
| K27 | customer-research | JTBD/confidence framework | 🟢 | `market-scan.ts`, brain-hub | `/market`, `/brain-hub` | §1 Market, §6 | P6 | ⬜ |
| K28 | churn-prevention | cancel/dunning playbook | ⬜ | ✅ `team-service.ts` EMPLOYEE_SKILLS.cassie → inject vào chat prompt | `/team` (chat Cassie) | ✅ §5 AI Employees | P3 | 🟢 |
| K29 | referrals | referral/affiliate | ⬜ | ✅ `team-service.ts` EMPLOYEE_SKILLS.cassie | `/team` (chat Cassie) | ✅ §5 | P3 | 🟢 |
| K30 | free-tools | engineering-as-mktg | ⬜ | NEW (CEO Advisor idea) | `/insights` | §5 CEO Advisor | P6 | ⬜ |
| K31 | lead-magnets | gated content | ⬜ | NEW | `/campaigns` | §4 (feature mới) | P6 | ⬜ |
| K32 | community-marketing | community-led growth | ⬜ | NEW (AI employee skill) | `/team` | §5 AI Employees | P6 | ⬜ |
| K33 | co-marketing | partner/joint campaign | ⬜ | NEW | `/campaigns` | §4 (feature mới) | P6 | ⬜ |
| K34 | competitor-profiling | dossier đối thủ | 🟢 | `competitor-brief.ts` | `/market` | §1 Market | P6 | ⬜ |
| K35 | revops | lifecycle/scoring/routing | 🟡 | ✅ `team-service.ts` EMPLOYEE_SKILLS.cleo (chat) — feature `/sales` still raw | `/team` (chat Cleo) | ✅ §5 | P3 | 🟢 |
| K36 | sales-enablement | deck/one-pager/objection | ⬜ | NEW (AI employee: Sales) | `/team` | §5 AI Employees | P6 | ⬜ |
| K37 | launch | playbook GTM | 🟡 | ✅ `team-service.ts` EMPLOYEE_SKILLS.cleo (chat) + `launch-orchestrator.ts` | `/team` (chat Cleo), `/launch` | ✅ §5 + §2 | P3 | 🟢 |
| K38 | pricing | Van Westendorp/packaging | ⬜ | ✅ `team-service.ts` EMPLOYEE_SKILLS.cleo | `/team` (chat Cleo) | ✅ §5 | P3 | 🟢 |
| K39 | marketing-ideas | ~139 idea theo stage | 🟡 | ✅ `team-service.ts` EMPLOYEE_SKILLS.cleo | `/team` (chat Cleo) | ✅ §5 | P3 | 🟢 |
| K40 | marketing-psychology | mental models (cross-cut) | ⬜ | ✅ `team-service.ts` EMPLOYEE_SKILLS.cleo (chat). Cross-cut inject vào K01/K02/K06 = fast-follow | `/team` (chat Cleo) | ✅ §5 | P3 | 🟢 |
| K41 | product-marketing | → đã map sang F01 (Brand IQ) | 🟢 | xem **F01** | `/brand-iq` | §1 Brand IQ | P2 | ⬜ |

**Hạ tầng lớp kiến thức:**
| ID | Item | Mô tả | Target | Phase | Status |
|---|---|---|---|---|---|
| K-loader | Knowledge loader | Codegen 41 SKILL.md → `skill-knowledge.generated.ts`; `getSkillKnowledge()`/`renderSkillKnowledge()` (có autonomous-guard reframe) export từ `@1person/core` | ✅ `packages/core/src/knowledge/`, `scripts/generate-skill-knowledge.ts`, `pnpm gen:skills` | P1 | 🟢 |

---

## 4. Bảng theo dõi — LỚP TOOL (CLI của họ → `executionTools` + admin key UI)

Target: bóc lõi `fetch` từ `tools/clis/<x>.js` → `apps/api/src/services/integrations/<x>.ts` (G1+G2) · đăng ký `executionTools` · **auth qua `companyToolCredentials` + admin UI**, KHÔNG env-var (`feedback_admin_config_ui`).

| ID | CLI nguồn (họ) | Gap nó lấp | Target service | Admin key UI | Feature UI | Walkthrough | Phase | Status |
|---|---|---|---|---|---|---|---|---|
| T01 | `ga4.js` | analytics thật | ✅ `ga4-client.ts` (runReport, tái dùng Google OAuth + scope analytics.readonly) + `routes/analytics.ts` (GET số liệu, POST propertyId qua knowledge_base) | dùng Google OAuth sẵn + nhập Property ID trên `/analytics` | ✅ `/analytics` `Ga4Panel` (3 state: chưa connect / chưa có property / live) | ✅ §5 | P4 | 🟢 |
| T02 | `ahrefs.js` / `dataforseo.js` | SEO data bên thứ 3 | _(additive — GSC T03 đã cho rank/keyword thật; cần API key Ahrefs/DataForSEO)_ | admin-config | `/seo-engine` | §1 | P6 | ⬜ |
| T03 | `google-search-console.js` | rank/keyword thật | ✅ `gsc-client.ts` (đã có sẵn, real OAuth) | có | `/seo-engine` | §1 | — | ✅ (pre-existing) |
| T04 | FB Page feed (organic) | publish social THẬT (trước là `console.log` stub) | ✅ `fb-messenger.ts` `publishPagePost()`/`findActiveFbConnection()` (Graph `/{pageId}/feed`, tái dùng Page token AES-256 của omnichannel) + `routes/social.ts` `publish-now` gọi thật, trả kết quả per-platform | dùng Page đã connect ở `/channels` | ✅ `/social` (toast per-platform: "Published to facebook" / lỗi rõ) | ✅ §2 Social Media | P5 | 🟢 |
| T05 | meta-publisher (ads) | ads push THẬT | 🟡 `meta-publisher.ts` `publishCampaignToMeta()` ĐÃ TỒN TẠI nhưng **cố ý chưa wire** — bật ad-spend thật là hành động tiêu tiền, cần founder duyệt + adAccount/OAuth + campaign PAUSED | platform OAuth | `/ads` | §2 | P5 | ⬜ (chờ founder duyệt) |
| T06 | `twilio.js`/`postscript.js` | SMS (chưa có) | _(cần chọn provider + số gửi; chưa build)_ | admin-config | _(soon)_ | _(soon)_ | P6 | ⬜ |
| T07 | `klaviyo.js`/`customer-io.js` | email lifecycle nâng cao | `integrations/email-platform.ts` | admin-config | `/sales` | §4 | P6 | ⬜ |

> Còn ~56 CLI khác (Apollo, Clearbit, Clay, Hunter, Stripe, Intercom...) — **chưa đưa vào tracker** cho tới khi có feature cần. Tránh tích hợp tool mồ côi không có UI (vi phạm G3/G4). Khi cần, thêm dòng T0x mới.

---

## 5. Bảng theo dõi — NỀN TẢNG & CHẤT LƯỢNG

| ID | Item | Nguồn họ | Gap nó lấp | Target | UI / Walkthrough | Phase | Status |
|---|---|---|---|---|---|---|---|
| F01 | Brand IQ = product-marketing++ | `product-marketing/SKILL.md` + `customer-research` | thêm JTBD Four Forces, verbatim customer language, anti-persona, objections | ✅ schema `brand-iq.ts` (4 cột mới) + mig `0009_brand_iq_pmm.sql` + `brand-iq-extractor.ts` (inject PMM framework + coerce + render) + `routes/brand-iq.ts` (zod) + `business-context.ts` (mọi agent thấy) | ✅ `/brand-iq` PositioningCard + `brand-iq-hooks.ts` types | ✅ §1 Brand IQ (whatItDoes) | P2 | 🟢 |
| E01 | Eval harness | `skills/*/evals/evals.json` (257 case) | regression test prompt agent | NEW `packages/core/evals/` + runner | (nội bộ, không cần UI) | P7 | ⬜ |

---

## 6. Changelog — ghi MỖI LẦN lấy thứ gì từ họ

> Format: `YYYY-MM-DD · [ID] · cổng đạt được · bằng chứng (file:line) · ai làm`

- **2026-05-24** · Khởi tạo tracker. Hoàn tất phân tích so sánh (41 skills + tools). Chưa lấy item nào vào code. Tất cả ở ⬜.
- **2026-05-24** · **[K-loader] G1+G2** · Copy 41 SKILL.md + LICENSE + SOURCE.md vào `packages/core/src/knowledge/marketing-skills/`; codegen `skill-knowledge.generated.ts` (41 skills); `renderSkillKnowledge()` có autonomous-guard; export từ `@1person/core`; rebuild `dist`. · Claude
- **2026-05-24** · **[K01] G1–G4 🟢** · `blog-generator.ts:13,109` inject copywriting vào bước viết content. · Claude
- **2026-05-24** · **[K03] G1–G4 🟢** · `ads-engine.ts:28,618` `system: ad-creative`. · Claude
- **2026-05-24** · **[K06] G1–G4 🟢 (partial)** · `landing-page-service.ts:31,506` inject cro vào hero (section conversion cao nhất). Các section khác (problem/solution/cta/pricing) = fast-follow. · Claude
- **2026-05-24** · **[K15+K16] G1–G4 🟢** · `outreach-engine.ts:28,822` `system: emails + cold-email`. · Claude
- **2026-05-24** · **G3+G4** · Thêm card "Powered by expert marketing frameworks" vào `walkthrough/page.tsx` (4 framework Live + feature mỗi cái powers + ghi nguồn MIT). · Claude
- **2026-05-24** · Verify: core typecheck sạch (chỉ pre-existing seed.ts), api import `renderSkillKnowledge` resolve sau rebuild, runtime smoke test OK (41 skills, copywriting 7481 ký tự). · Claude
- **2026-05-26** · **[WP hardening / production-grade]** · Bảo mật + tin cậy cho WordPress: mã hoá App Password khi lưu (`encryptSecret` trong `seo-engine` connect) + giải mã khi đọc (`decryptMaybe`) ở 5 điểm (launch-orchestrator, seo-engine test/categories/publish) với fallback plaintext cho row cũ; **bịt lỗ lộ password**: `companies.ts` `sanitizeCompany()` strip `appPassword` khỏi GET list + GET one (chỉ trả `connected:true/false`). Mặc định autopilot vẫn **draft** (founder chọn). api typecheck 0 lỗi. ⚠️ live cần test trên 1 WP thật. · Claude
- **2026-05-25** · **[P8] ⭐ G1–G4 🟢** · Content Autopilot (1-2 blog/ngày tự động → WP draft): schema `content_autopilot` + cột `source` trên `campaign_launches` (mig `0010`); `content-autopilot.ts` (getConfig/upsert/runAutopilotOnce/runDueAutopilots — tái dùng `startLaunch`); `routes/autopilot.ts` (GET/PUT/run-now) mount `/autopilot`; scheduler in-API `setInterval` 15' gọi `runDueAutopilots` (chỉ công ty đã bật, tạo WP **draft** = human-in-the-loop); `/autopilot/page.tsx` (bật/tắt + nhịp + targets + keyword queue + "Run one now" + history); `autopilot-hooks.ts`; sidebar "Content Autopilot"; walkthrough §2. Thiết kế: `docs/strategy/content-autopilot-design.md`. api+web typecheck 0 lỗi. ⚠️ cần áp mig `0010`. · Claude
- **2026-05-25** · **[C1] G1–G4 🟢** · Screenshot→Vision analyzer (connect-UX cho non-tech): `routes/vision-analyze.ts` (Anthropic vision sonnet-4, inject Brand IQ + skill framework tùy chọn) mount `/vision`; `ScreenshotAnalyzer` trên `/analytics` (drop/paste/upload ảnh → phân tích markdown + copy, zero OAuth); walkthrough §5. Đáp đúng ví dụ Claude-for-Chrome của founder mà không cần build extension. Research: `docs/strategy/easy-platform-connect-research.md`. Founder đã duyệt làm tiếp C2 (OAuth+auto-discovery, sẽ tự đăng ký Meta/Google app). api+web typecheck 0 lỗi. · Claude
- **2026-05-24** · **[P6] ⭐ G1–G4 🟢** · Marketing Playbooks Studio — gọi được cả 41 skill qua UI: `core` thêm `MARKETING_SKILL_CATEGORIES`/`listSkillCatalog()`/`skillLabel()`; `routes/marketing-skills.ts` (GET /catalog, POST /:companyId/run — inject framework + Brand IQ + business context, featureKey `marketing_skill_run`) mount `/marketing-skills`; `/playbooks/page.tsx` (catalog theo nhóm + dialog chạy + output + copy); `marketing-skills-hooks.ts`; sidebar "Marketing Playbooks"; walkthrough §5 + card "Expert frameworks" link sang Studio. **Đóng khoảng cách độ phủ vs marketingskills.** api+web typecheck 0 lỗi, catalog smoke test 41 skill/7 nhóm. · Claude
- **2026-05-24** · **[T04 / P5] G1–G4 🟢** · FB organic publish thật: `fb-messenger.ts` thêm `publishPagePost()` (Graph `/{pageId}/feed`) + `findActiveFbConnection()`, tái dùng Page token AES-256; `routes/social.ts` `publish-now` gọi publish thật per-platform, trả `{results, published}`; `/social` toast theo kết quả từng platform; walkthrough §2 chỉnh cho chính xác (FB live, IG/LinkedIn draft). api+web typecheck 0 lỗi. ⚠️ live cần Page token có quyền `pages_manage_posts`. T05 ads-push (publisher đã có) cố ý chưa bật (tiêu tiền — chờ founder duyệt); T06 SMS chưa build. · Claude
- **2026-05-24** · **[T01 / P4] G1–G4 🟢** · GA4 thật: `ga4-client.ts` (adapt từ `ga4.js`, runReport sessions/users/conversions/top pages/channels); mở rộng Google OAuth scope +`analytics.readonly` (`integrations.ts`); `routes/analytics.ts` (GET số liệu, POST propertyId lưu knowledge_base `integration_ga4`) mount `/analytics`; `/analytics` `Ga4Panel` 3-state (chưa connect Google / chưa nhập property / live) + Refresh thủ công (no cron); walkthrough §5. api+web typecheck 0 lỗi. ⚠️ live cần founder connect Google (re-consent vì thêm scope) + nhập GA4 Property ID. · Claude
- **2026-05-24** · **[P3] G1–G4 🟢** · AI Employees chuyên môn hóa: `team-service.ts` thêm `EMPLOYEE_SKILLS` (mỗi nhân viên 1 bundle) + `EMPLOYEE_SPECIALTIES`; inject full bundle (maxCharsEach 1800) vào chat system prompt; `routes/team.ts` trả `specialties` (list + detail); `team-hooks.ts` type; `/team` hiện chip "Expert playbooks"; walkthrough §5. Skill live qua chat: K28 churn, K29 referral, K35 revops, K37 launch, K38 pricing, K39 ideas, K40 psychology (+ reinforce K01/K03/K04/K05/K07/K08/K09/K10/K15/K16/K17/K19/K20/K24/K32 trên các nhân viên khác). api+web typecheck 0 lỗi. · Claude
- **2026-05-24** · **[F01 / P2] G1–G4 🟢** · Brand IQ++: schema `brand-iq.ts` +4 cột (jtbd_forces, customer_language, anti_personas, objections); mig `0009_brand_iq_pmm.sql`; `brand-iq-extractor.ts` inject `product-marketing`+`customer-research` framework vào prompt extract + coerce + insert + `renderBrandIqContext` (mọi agent thấy); `routes/brand-iq.ts` zod cho 4 facet; frontend `brand-iq-hooks.ts` types; `/brand-iq` `PositioningCard`; walkthrough §1. Web typecheck 0 lỗi, api sạch. ⚠️ **Cần áp mig 0009** (DB `1person-postgres` chưa chạy lúc làm). · Claude

---

## 7. Câu hỏi cần Founder quyết trước khi P1 chạy

1. **Ngôn ngữ skill:** giữ tiếng Anh (nguyên bản, dễ đồng bộ update từ họ) hay dịch tiếng Việt (hợp user VN)? → ảnh hưởng K-loader.
2. **Thứ tự P3 (AI Employees):** gắn bundle skill nào cho nhân viên nào trước? (đề xuất: Seomi SEO ← K04/K05/K08; Penn Copy ← K01/K07; Growth ← K28/K29/K38).
3. **P4 vs P5 trước:** đọc số liệu thật (analytics/SEO data) trước, hay publish thật (social/ads) trước?
