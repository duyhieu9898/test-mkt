/**
 * TenantAI singleton — bridges apps/api to the @1person/ai-tenant module
 * (future @trustai/core). All document/RAG/audit/agent operations in the
 * trust-grade pipeline go through this instance.
 *
 * See:
 * - docs/architecture/06-transparent-data-system.md §2 (existing foundation)
 * - Implementation plan W0.1 (consolidate documents tables)
 *
 * The @1person/ai-tenant package owns its own postgres connection pool
 * (cached by database URL in packages/ai-tenant/src/db.ts), so creating
 * a second instance here is safe — same URL = same cached pool.
 */

import { createTenantAI, type TenantAI } from '@1person/ai-tenant';
import path from 'path';
import { env } from './env';

let instance: TenantAI | null = null;

/**
 * Get the process-wide TenantAI singleton. Lazy-initialized so that
 * code paths which never touch the trust module don't pay the cost.
 */
export function getTenantAI(): TenantAI {
  if (!instance) {
    // Storage path lives alongside the deploy directory so on-prem
    // operators can mount it as a volume. W1A.6 (deployment-mode)
    // will let operators override this at runtime.
    const storagePath = path.resolve(
      process.cwd(),
      '..',
      '..',
      'deploy',
      'tenant-data',
    );

    instance = createTenantAI({
      databaseUrl: env.DATABASE_URL,
      // LLM + embedding defaults use the same providers apps/api already
      // relies on (OpenAI via OPENAI_API_KEY). Multi-provider pluggability
      // lands in W1A.2.
      llm: {
        provider: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        model: env.FTUX_AI_MODEL,
        apiKey: env.OPENAI_API_KEY,
      },
      embedding: {
        provider: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        model: 'text-embedding-3-small',
        dimensions: 1536,
        apiKey: env.OPENAI_API_KEY,
      },
      storagePath,
    });
  }
  return instance;
}

/**
 * Ensure a trust-grade tenant exists for the given company ID.
 * Idempotent — safe to call on every request. Returns the internal
 * tenant ID used by all @1person/ai-tenant methods.
 */
export async function ensureTenantForCompany(
  companyId: string,
  companyName: string,
): Promise<string> {
  return getTenantAI().initTenant(companyId, companyName);
}
