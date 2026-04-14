# Codebase Tour

Quick "where is X?" reference. Bookmark this page.

## Where do I add…

### …a new API endpoint?

1. Create or edit `apps/api/src/routes/<domain>.ts`
2. Use the existing pattern (Hono router + `authMiddleware` + Zod validator + ownership check)
3. Delegate logic to a service in `apps/api/src/services/<domain>-<feature>.ts`
4. Register in `apps/api/src/index.ts` under `api.route('/domain', domainRouter);`
5. Add a React Query hook in `apps/web/src/lib/api/hooks.ts`
6. Consume the hook in the UI page/component

### …a new database table?

1. Create `packages/core/src/db/schema/<name>.ts` using Drizzle
2. Export from `packages/core/src/db/schema/index.ts`
3. Build: `pnpm --filter @1person/core build`
4. Apply: `pnpm --filter @1person/core db:push` (dev) or `db:generate` → `db:migrate` (prod)

### …a new dashboard page?

1. Create `apps/web/src/app/(dashboard)/[companyId]/<slug>/page.tsx`
2. Use `'use client'` directive and `useParams()` to read `companyId`
3. Add a nav item in `apps/web/src/components/layout/sidebar.tsx` (with `unlockLevel` if gamified)
4. Add the i18n strings to `apps/web/src/lib/i18n.ts` if you support multiple locales

### …a new UI component?

- If it's a primitive (button, dialog variant): `apps/web/src/components/ui/`
- If it belongs to a feature: `apps/web/src/components/<feature>/` (e.g. `dashboard/`, `market/`, `landing-pages/`)
- Use existing utilities: `cn()` from `lib/utils.ts`, `formatCurrency`/`formatNumber` from same file
- Framer Motion for animations, Lucide icons, Tailwind for styling — no new UI deps

### …an AI-powered feature?

1. Use `llmGenerate(messages, { featureKey, maxTokens })` from `apps/api/src/lib/llm.ts`
2. The `featureKey` maps to admin-configurable provider + model + credit cost in DB
3. Call `ensureSufficientCredits(companyId, cost)` before the LLM call
4. Call `chargeFixedCredits(companyId, cost, { featureKey, refKind, refId, actor })` after success
5. If the output should be remembered, write to Brain via `ai.brain.appendLearning()` or `ai.brain.upsertMarketPosition()`

### …a new background job?

1. Add a worker in `apps/api/src/workers/<name>.ts`
2. Register in `apps/api/src/index.ts`
3. **Avoid crons for user data refresh** — prefer manual "Refresh" buttons (see [feedback](../../CLAUDE.md))

## Where is…

### The auth flow?

- Middleware: `apps/api/src/middleware/auth.ts` (`authMiddleware`, `getUserCompanies`)
- JWT utils: `apps/api/src/lib/auth.ts`
- Login route: `apps/api/src/routes/auth.ts`
- Frontend store: `apps/web/src/stores/auth-store.ts` (Zustand, persisted)

### The LLM wrapper?

- `apps/api/src/lib/llm.ts` — `llmGenerate()`, `extractJSON()`
- Resolves provider/model from admin DB config per `featureKey`
- Wraps every call in Langfuse trace (http://localhost:5050)

### The credits system?

- `apps/api/src/lib/credits.ts` — `ensureSufficientCredits`, `chargeFixedCredits`
- Schema: `packages/core/src/db/schema/economy.ts`
- Admin UI: `apps/web/src/app/admin/credits/`
- User-facing badge: `apps/web/src/components/credit-badge.tsx`

### The Brain (AI memory)?

- Package: `packages/ai-tenant/`
- Store: `packages/ai-tenant/src/brain-store.ts`
- Accessed via `getTenantAI().brain.*` in API services
- User-editable UI: `apps/web/src/app/(dashboard)/[companyId]/brain/`

### The CEO Advisor?

- Service: `apps/api/src/services/ceo-advisor.ts`
- Route: `apps/api/src/routes/insights.ts` (`POST /advisor/refresh`, `GET /advisor/latest`)
- UI: `apps/web/src/app/(dashboard)/[companyId]/insights/page.tsx`
- Brief store: `packages/ai-tenant/src/ceo-advisor-store.ts`

### Gamification?

- Growth Score: `apps/api/src/services/growth-score.ts`
- Daily Missions: `apps/api/src/services/daily-missions.ts`
- Schema: `packages/core/src/db/schema/gamification.ts` (`ceo_daily_missions`, `ceo_streaks`)
- UI widgets: `apps/web/src/components/dashboard/*`

### Market Intelligence?

- Services: `apps/api/src/services/{suggest-competitors,competitor-brief,competitor-comparison,market-digest,market-memory,positioning-map}.ts`
- Scan service: `apps/api/src/services/market-scan.ts`
- Route: `apps/api/src/routes/market.ts`
- UI: `apps/web/src/app/(dashboard)/[companyId]/market/page.tsx` + `components/market/*`

### FTUX (onboarding)?

- Service: `apps/api/src/services/ftux-processor.ts`, `website-analyzer.ts`
- Route: `apps/api/src/routes/ftux.ts`
- UI: `apps/web/src/app/(ftux)/welcome/page.tsx` + `components/ftux/*`

### Landing page builder?

- Service: `apps/api/src/services/landing-page-service.ts`
- Route: `apps/api/src/routes/landing-pages.ts`
- UI: `apps/web/src/app/(dashboard)/[companyId]/landing-pages/`
- Block components: `apps/web/src/components/landing-pages/blocks/`

### Campaigns / marketing?

- Services: `apps/api/src/services/marketing-autonomous.ts`, `image-generator.ts`
- Route: `apps/api/src/routes/marketing-engine.ts`, `campaigns.ts`
- UI: `apps/web/src/app/(dashboard)/[companyId]/campaigns/`

### Chatbot?

- Service: `packages/ai-tenant/src/rag-pipeline.ts` (RAG search)
- Route: `apps/api/src/routes/chatbot.ts`
- UI: `apps/web/src/app/(dashboard)/[companyId]/chatbot/`

### Admin panel?

- Route: `apps/api/src/routes/admin.ts`, `admin-config.ts`, `admin-credits.ts`
- UI: `apps/web/src/app/admin/`
- Only users with `role: 'admin'` can access

### Global project config / rules?

- `CLAUDE.md` (root) — vision, principles, conventions
- `docs/architecture/` — 11 design docs
- `docs/brainstorm/` — feature specs

## Common imports cheatsheet

```ts
// API — route file
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../lib/db';
import { companies } from '@1person/core/db';
import { authMiddleware, getUserCompanies } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';
import { getTenantAI, ensureTenantForCompany } from '../lib/tenant-ai';
import { ensureSufficientCredits, chargeFixedCredits } from '../lib/credits';
import { llmGenerate, extractJSON } from '../lib/llm';
```

```tsx
// Web — page component
'use client';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
```

## Patterns to follow

### Ownership verification (EVERY route)

```ts
async function verifyOwnership(companyId: string, userId: string): Promise<string> {
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
    columns: { id: true, name: true, ownerId: true },
  });
  if (!company) throw new HTTPException(404, { message: 'Company not found' });
  if (company.ownerId !== userId) throw new HTTPException(403, { message: 'You do not own this company' });
  return ensureTenantForCompany(company.id, company.name);
}
```

### React Query hook

```ts
export const useMyFeature = (companyId: string) => {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['my-feature', companyId],
    queryFn: () => api.get<{ data: MyType }>(`/my-feature/${companyId}`, { token: token! }),
    enabled: !!token && !!companyId,
  });
};
```

### Service with LLM + memory write-back

```ts
export async function myAIFeature(args: { companyId: string; tenantId: string }) {
  const ctx = await buildBusinessContext(args.companyId, 'admin');
  const prompt = `... use ${ctx.companyName}, ${ctx.products.join(' | ')} ...`;
  const response = await llmGenerate(
    [{ role: 'user', content: prompt }],
    { featureKey: 'my_feature', maxTokens: 2000 },
  );
  const parsed = extractJSON(response.text);
  // save output back to Brain so other features can use it
  await getTenantAI().brain.appendLearning(
    args.tenantId,
    { lesson: parsed.summary, category: 'insight', metricSnapshot: { source: 'my-feature' } },
    'system:my-feature',
  );
  return parsed;
}
```

## Debug tips

- **Can't find where a route is defined?** Grep `api.route('/foo'` in `apps/api/src/index.ts`.
- **LLM call is failing?** Open http://localhost:5050 (Langfuse) — every call is traced with prompt + response + error.
- **DB query failing?** Open Drizzle Studio: `pnpm --filter @1person/core db:studio` → browser at :5173.
- **Frontend shows stale data?** Check React Query key — if you mutate, invalidate the matching `queryKey` in `onSuccess`.
- **Auth token missing?** Check `useAuthStore` — token is persisted in localStorage under key `auth-storage`.

## Gotchas you'll hit

1. **`@1person/core` is consumed as a built package, not a source package.** After changing any schema, run `pnpm --filter @1person/core build` before the API picks up the new types.
2. **`tsx watch` (API) restarts on file change — but won't reload schemas from `@1person/core` unless you rebuilt the core package.**
3. **`db:push` fails with "duplicated index" due to a pre-existing bug in `blog_posts`.** You can ignore the warning or create tables manually via `docker exec 1person-postgres psql ...`.
4. **Frontend loads but API calls 401?** Log out and log back in — JWT may be expired.
5. **Next.js 14 App Router caching.** If you see stale data, check `revalidate` and ensure React Query key is correct.

That's the tour. Now go ship something.
