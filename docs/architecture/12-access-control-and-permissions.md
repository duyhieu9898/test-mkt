# 12 - Access Control & Permissions

> Current status: Phase 1 implemented.
> Scope: company-level role-based access control for the 1Person dashboard and API.

---

## Goal

1Person is a multi-company workspace. A user can own one company and be invited
to another company with a different role. Permissions must therefore be checked
on the backend before any company data is read, changed, published, or charged.

The UI can hide buttons for convenience, but the API is the source of truth.

---

## Roles

| Role | Intended user | Summary |
|---|---|---|
| Owner | Company creator / account owner | Full control over company, members, channels, publishing, and credits. |
| Admin | Trusted operator | Manage most settings, team access, channels, credits, and execution. |
| Marketing Lead | Marketing manager | Create, launch, and publish campaigns. Can spend company credits. |
| Content Creator | Writer/designer/operator | Create and edit content drafts, landing pages, and assets. Cannot publish social posts. |
| Analyst | Reporting / research user | View strategy, market, campaign, and performance data. Cannot create, edit, publish, or spend credits. |
| Viewer | Read-only stakeholder | Can review company information, but cannot create, edit, publish, upload, or spend credits. |

Implementation source:

- `apps/api/src/lib/company-access.ts`
- `COMPANY_ROLE_PERMISSIONS`
- `authorizeCompanyAccess(userId, companyId, permission)`

---

## Permission Groups

Permissions are intentionally product-level, not database-table-level. This keeps
the model understandable for non-technical users.

Key permission groups:

- `company.*`: view/edit company and manage team members.
- `brand_iq.*`: read or update Brand IQ.
- `knowledge.*`: view, upload, and approve Knowledge Hub / Meeting Intelligence data.
- `ceo_advisor.*`: view or refresh CEO Advisor.
- `growth_plan.*`: view or update Growth Plan.
- `market.*`: view market data or run market scans.
- `campaign.*`: view, create, generate AI, edit, launch, and publish social posts.
- `landing_page.*`: create, edit, request publish, or publish directly.
- `channels.*`: connect channels and publish through them.
- `chatbot.*`: configure chatbot and view conversations.
- `credits.*`: view, spend, or manage company credits.

---

## Credit Ownership

Credits belong to the company, not to individual users.

Rules:

- A new company receives the initial free company credit balance.
- Any member with `credits.spend` can spend the company credit pool.
- Each debit records the actor as `user:{userId}` so the company can audit who
  spent credits.
- Team Access should show how many company credits each member has used.
- If a user lacks `credits.spend`, the API must reject credit-consuming actions
  before starting external AI/API work.

Examples of credit-consuming actions:

- Generate campaign.
- Generate AI banners.
- Generate campaign video.
- Crawl data.
- Generate all Content Hub outputs.
- Publish social posts.

---

## Backend Enforcement

All authenticated company endpoints should follow this pattern:

```ts
const { userId } = c.get('user');
const companyId = c.req.param('companyId');
await authorizeCompanyAccess(userId, companyId, 'campaign.edit');
```

For actions that spend credits:

```ts
await authorizeCompanyAccess(userId, companyId, 'campaign.generate_ai');
await authorizeCompanyAccess(userId, companyId, 'credits.spend');
await ensureSufficientCredits(companyId, estimatedCost);
```

Important rule:

> Never rely only on frontend button visibility. Every write, publish,
> connection, upload, AI generation, or credit spend must be protected in the API.

---

## Current Backend Coverage

The main Phase 1 protected areas are:

- Companies
- Team Access
- Credits
- Campaigns and Campaign Launcher
- Marketing Engine campaign assets, social posts, banners, and videos
- Social scheduled posts
- Knowledge Hub and Meeting Intelligence
- Brand IQ
- Market & Competitors
- Landing Pages
- Analytics read access and GA4 property configuration
- Channels and Omnichannel
- Chatbot dashboard configuration and conversations
- Content Editor

Some older/legacy modules still use route-local ownership checks. They should be
migrated gradually to `authorizeCompanyAccess` when those areas are touched.

---

## UI Rules

The UI should:

- Hide or disable actions the current role cannot perform.
- Show a simple explanation when a user is blocked.
- Avoid exposing technical permission names to non-technical users.
- Keep read-only users oriented: they should still understand what they are
  viewing and who can take action.

Suggested copy:

- "You can review this, but your role cannot edit it."
- "Only an Owner, Admin, or Marketing Lead can publish this campaign."
- "Your role cannot spend company credits. Ask an Owner or Admin to change your access."
- "You can view company knowledge, but your role cannot upload documents or meetings."

---

## Test Checklist

Before shipping permission changes, test with at least these users:

1. Owner
   - Can invite members, manage credits, connect channels, publish, and edit.
2. Admin
   - Can manage most company work without being the owner.
3. Marketing Lead
   - Can create, launch, and publish campaigns.
4. Content Creator
   - Can create and edit drafts, but cannot publish social posts.
5. Analyst
   - Can view analysis and performance, but cannot run restricted writes unless explicitly allowed.
6. Viewer
   - Can view pages, but cannot upload, edit, generate AI, publish, or spend credits.

API-level test cases:

- Viewer calling upload meeting should return `403`.
- Viewer calling edit social post should return `403`.
- Viewer calling publish Facebook should return `403`.
- Content Creator calling publish social should return `403`.
- Marketing Lead calling publish social should pass if credits and channel connection are valid.
- Any role without `credits.spend` calling an AI generation endpoint should return `403`.
