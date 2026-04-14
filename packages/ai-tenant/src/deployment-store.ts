// =============================================================================
// @1person/ai-tenant — Deployment Mode Store (P0-A1)
// =============================================================================
// One row per tenant describing how apps/api should route LLM calls:
//   - 'cloud'      → shared 1Person infrastructure (default)
//   - 'private'    → bring-your-own keys, data still on 1Person storage
//   - 'on_premise' → tenant-supplied vLLM / Ollama endpoint
//
// Every mutation is audit-logged on the chain-hashed trail so mode changes
// are traceable alongside document uploads and brain edits.
//
// See docs/architecture/08-post-managed-agents-pmf-plan.md §P0-A1.
// =============================================================================

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { eq } from 'drizzle-orm';
import { deploymentModes } from './schema.js';
import { logAction } from './audit-trail.js';
import type { Database } from './db.js';

// ---------------------------------------------------------------------------
// Encryption for Bring-Your-Own API keys (P0-A2)
// ---------------------------------------------------------------------------
// Private Cloud mode stores per-tenant provider keys (OpenAI, Anthropic,
// Gemini, OpenRouter) inside the existing `config` jsonb column. They are
// encrypted at rest with AES-256-GCM using a master key sourced from the
// TRUSTAI_KEY_ENCRYPTION_KEY env var. The IV is generated per-write and
// stored alongside the ciphertext so multiple keys can coexist in one row.
//
// Format stored in config.byoKeys[provider]:
//   { iv: base64, ct: base64, tag: base64, kdf: 'sha256', v: 1 }
// ---------------------------------------------------------------------------

const ENC_ALGO = 'aes-256-gcm';

function getMasterKey(): Buffer {
  const raw =
    process.env.TRUSTAI_KEY_ENCRYPTION_KEY ||
    process.env.JWT_SECRET || // fallback so dev works without extra env var
    'trustai-dev-key-change-in-production';
  return createHash('sha256').update(raw).digest();
}

export interface EncryptedKey {
  iv: string;
  ct: string;
  tag: string;
  kdf: 'sha256';
  v: 1;
}

export function encryptApiKey(plaintext: string): EncryptedKey {
  const key = getMasterKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ENC_ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    ct: ct.toString('base64'),
    tag: tag.toString('base64'),
    kdf: 'sha256',
    v: 1,
  };
}

export function decryptApiKey(enc: EncryptedKey): string {
  const key = getMasterKey();
  const iv = Buffer.from(enc.iv, 'base64');
  const ct = Buffer.from(enc.ct, 'base64');
  const tag = Buffer.from(enc.tag, 'base64');
  const decipher = createDecipheriv(ENC_ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
  return plain.toString('utf8');
}

export type ByoKeyProvider = 'openai' | 'anthropic' | 'gemini' | 'openrouter';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeploymentModeKind = 'cloud' | 'private' | 'on_premise';

export interface DeploymentMode {
  id: string;
  tenantId: string;
  mode: DeploymentModeKind;
  vllmUrl: string | null;
  vllmModel: string | null;
  config: Record<string, unknown>;
  updatedAt: Date;
}

export interface DeploymentModeInput {
  mode: DeploymentModeKind;
  vllmUrl?: string | null;
  vllmModel?: string | null;
  config?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToDeploymentMode(row: {
  id: string;
  tenantId: string;
  mode: string;
  vllmUrl: string | null;
  vllmModel: string | null;
  config: unknown;
  updatedAt: Date;
}): DeploymentMode {
  return {
    id: row.id,
    tenantId: row.tenantId,
    mode: row.mode as DeploymentModeKind,
    vllmUrl: row.vllmUrl ?? null,
    vllmModel: row.vllmModel ?? null,
    config: (row.config as Record<string, unknown>) ?? {},
    updatedAt: row.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the current deployment mode for a tenant, or null if never set.
 * Callers should treat null as equivalent to `{ mode: 'cloud' }`.
 */
export async function getDeploymentMode(
  db: Database,
  tenantId: string,
): Promise<DeploymentMode | null> {
  const rows = await db
    .select()
    .from(deploymentModes)
    .where(eq(deploymentModes.tenantId, tenantId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return rowToDeploymentMode(row);
}

/**
 * Upsert the deployment mode for a tenant. Emits an audit entry on the
 * chain-hashed trail so operator-facing mode changes are traceable.
 */
export async function upsertDeploymentMode(
  db: Database,
  tenantId: string,
  input: DeploymentModeInput,
  actor: string = 'system',
): Promise<DeploymentMode> {
  const existing = await getDeploymentMode(db, tenantId);

  if (existing) {
    const [updated] = await db
      .update(deploymentModes)
      .set({
        mode: input.mode,
        vllmUrl: input.vllmUrl ?? null,
        vllmModel: input.vllmModel ?? null,
        config: input.config ?? existing.config,
        updatedBy: actor,
        updatedAt: new Date(),
      })
      .where(eq(deploymentModes.tenantId, tenantId))
      .returning();
    if (!updated) {
      throw new Error('Failed to update deployment mode');
    }

    await logAction(db, tenantId, 'data_access', actor, {
      kind: 'deployment_mode_update',
      mode: updated.mode,
      previousMode: existing.mode,
      vllmUrl: updated.vllmUrl,
      vllmModel: updated.vllmModel,
    });

    return rowToDeploymentMode(updated);
  }

  const [created] = await db
    .insert(deploymentModes)
    .values({
      tenantId,
      mode: input.mode,
      vllmUrl: input.vllmUrl ?? null,
      vllmModel: input.vllmModel ?? null,
      config: input.config ?? {},
      updatedBy: actor,
    })
    .returning();
  if (!created) {
    throw new Error('Failed to create deployment mode');
  }

  await logAction(db, tenantId, 'data_access', actor, {
    kind: 'deployment_mode_update',
    mode: created.mode,
    previousMode: null,
    vllmUrl: created.vllmUrl,
    vllmModel: created.vllmModel,
  });

  return rowToDeploymentMode(created);
}

// ---------------------------------------------------------------------------
// Bring-Your-Own API Key storage (P0-A2)
// ---------------------------------------------------------------------------
// Stored under deployment.config.byoKeys[provider] = EncryptedKey.
// Never returned to the frontend in plaintext — the decryptApiKey helper
// is server-only.
// ---------------------------------------------------------------------------

/**
 * Encrypt + store a per-tenant provider API key inside the deployment
 * mode config jsonb. Creates the deployment row if it doesn't exist yet.
 * The key is never stored or logged in plaintext.
 */
export async function setByoApiKey(
  db: Database,
  tenantId: string,
  provider: ByoKeyProvider,
  plaintextKey: string,
  actor: string = 'system',
): Promise<void> {
  const existing = await getDeploymentMode(db, tenantId);
  const mode = existing?.mode ?? 'private';
  const config = { ...(existing?.config ?? {}) } as Record<string, unknown>;

  const byoKeys = (config.byoKeys as Record<string, EncryptedKey> | undefined) ?? {};
  byoKeys[provider] = encryptApiKey(plaintextKey);
  config.byoKeys = byoKeys;

  await upsertDeploymentMode(
    db,
    tenantId,
    {
      mode,
      vllmUrl: existing?.vllmUrl ?? null,
      vllmModel: existing?.vllmModel ?? null,
      config,
    },
    actor,
  );

  // Additional audit entry specifically flagged as a key update so ops
  // can filter "key changed" events from the audit log.
  await logAction(db, tenantId, 'data_access', actor, {
    kind: 'byo_key_update',
    provider,
    // never include any plaintext or ciphertext in the audit details
  });
}

/**
 * Retrieve a decrypted provider key for a tenant. Returns null if no
 * key is set. Server-only — never expose this via the REST API.
 */
export async function getByoApiKey(
  db: Database,
  tenantId: string,
  provider: ByoKeyProvider,
): Promise<string | null> {
  const mode = await getDeploymentMode(db, tenantId);
  if (!mode) return null;
  const byoKeys = (mode.config?.byoKeys as Record<string, EncryptedKey> | undefined) ?? {};
  const enc = byoKeys[provider];
  if (!enc) return null;
  try {
    return decryptApiKey(enc);
  } catch (err) {
    console.error(`[deployment-store] Failed to decrypt ${provider} key for tenant ${tenantId}:`, err);
    return null;
  }
}

/**
 * Remove a stored BYO key. Keeps the deployment row if other keys or
 * config remain.
 */
export async function deleteByoApiKey(
  db: Database,
  tenantId: string,
  provider: ByoKeyProvider,
  actor: string = 'system',
): Promise<void> {
  const existing = await getDeploymentMode(db, tenantId);
  if (!existing) return;
  const config = { ...(existing.config ?? {}) } as Record<string, unknown>;
  const byoKeys = { ...((config.byoKeys as Record<string, EncryptedKey> | undefined) ?? {}) };
  delete byoKeys[provider];
  config.byoKeys = byoKeys;

  await upsertDeploymentMode(
    db,
    tenantId,
    {
      mode: existing.mode,
      vllmUrl: existing.vllmUrl,
      vllmModel: existing.vllmModel,
      config,
    },
    actor,
  );

  await logAction(db, tenantId, 'data_access', actor, {
    kind: 'byo_key_delete',
    provider,
  });
}

/**
 * List which providers have a BYO key set (for UI display). Returns
 * ONLY the provider names — never any key material.
 */
export async function listByoKeyProviders(
  db: Database,
  tenantId: string,
): Promise<ByoKeyProvider[]> {
  const mode = await getDeploymentMode(db, tenantId);
  if (!mode) return [];
  const byoKeys = (mode.config?.byoKeys as Record<string, EncryptedKey> | undefined) ?? {};
  return Object.keys(byoKeys) as ByoKeyProvider[];
}
