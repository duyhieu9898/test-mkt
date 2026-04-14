// =============================================================================
// @1person/ai-tenant — Business Brain Store (W0.2)
// =============================================================================
// CRUD for the four editable knowledge stores that power every generation:
//   - brand voice        (one row per tenant, versioned)
//   - personas           (many rows, one can be primary)
//   - products           (many rows)
//   - campaign learnings (append-only lessons from past campaigns)
//
// All mutations emit an audit entry on the chain-hashed audit log so that
// edits to the Brain are as traceable as document uploads.
//
// See docs/architecture/06-transparent-data-system.md §6a.
// =============================================================================

import { eq, and, desc } from 'drizzle-orm';
import {
  brainBrandVoice,
  brainPersonas,
  brainProducts,
  brainCampaignLearnings,
  brainMarketPosition,
  brainSalesPlaybook,
  brainMarketingStrategy,
} from './schema.js';
import { logAction } from './audit-trail.js';
import type { Database } from './db.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BrandVoiceInput {
  tone?: string;
  description?: string | null;
  wordsToUse?: string[];
  wordsToAvoid?: string[];
  examples?: string[];
}

export interface BrandVoice extends Required<BrandVoiceInput> {
  id: string;
  tenantId: string;
  version: number;
  updatedAt: Date;
}

export interface PersonaInput {
  name: string;
  description?: string | null;
  attributes?: {
    demographics?: string;
    painPoints?: string[];
    goals?: string[];
    channels?: string[];
  };
  isPrimary?: boolean;
}

export interface Persona extends PersonaInput {
  id: string;
  tenantId: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductInput {
  name: string;
  description?: string | null;
  price?: string | null;
  attributes?: {
    category?: string;
    features?: string[];
    benefits?: string[];
    targetPersonaIds?: string[];
  };
}

export interface Product extends ProductInput {
  id: string;
  tenantId: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CampaignLearningInput {
  campaignId?: string | null;
  lesson: string;
  category?: 'win' | 'fail' | 'insight';
  metricSnapshot?: Record<string, unknown>;
}

export interface CampaignLearning extends CampaignLearningInput {
  id: string;
  tenantId: string;
  createdAt: Date;
}

// ─── New brain entities (doc 10 §4) ────────────────────────────────

export interface MarketPositionInput {
  swot?: {
    strengths?: string[];
    weaknesses?: string[];
    opportunities?: string[];
    threats?: string[];
  };
  differentiation?: string | null;
  positioningStatement?: string | null;
  targetMarket?: string | null;
}

export interface MarketPosition extends Required<MarketPositionInput> {
  id: string;
  tenantId: string;
  version: number;
  updatedAt: Date;
}

export interface SalesPlaybookInput {
  idealCustomerProfile?: string | null;
  qualificationRules?: string[];
  stages?: Array<{ name: string; description?: string; exitCriteria?: string }>;
  objections?: Array<{ objection: string; response: string }>;
  closingLines?: string[];
  emailTemplates?: Array<{ name: string; stage?: string; body: string }>;
}

export interface SalesPlaybook extends Required<SalesPlaybookInput> {
  id: string;
  tenantId: string;
  version: number;
  updatedAt: Date;
}

export interface MarketingStrategyInput {
  channels?: Array<{
    name: string;
    kind: 'online' | 'offline';
    enabled: boolean;
    budgetShare?: number;
    voiceOverride?: string;
    notes?: string;
  }>;
  monthlyBudget?: string | null;
  themes?: Array<{ title: string; description?: string; quarter?: string }>;
  funnelStages?: string[];
  kpis?: Array<{ name: string; target?: string }>;
}

export interface MarketingStrategy extends Required<MarketingStrategyInput> {
  id: string;
  tenantId: string;
  version: number;
  updatedAt: Date;
}

/**
 * Full brain snapshot — the shape agents consume when building prompts.
 * Composed from all four stores in a single query.
 */
export interface BrainSnapshot {
  tenantId: string;
  brandVoice: BrandVoice | null;
  personas: Persona[];
  primaryPersona: Persona | null;
  products: Product[];
  recentLearnings: CampaignLearning[];
  marketPosition: MarketPosition | null;
  salesPlaybook: SalesPlaybook | null;
  marketingStrategy: MarketingStrategy | null;
}

// ---------------------------------------------------------------------------
// Brand voice — one row per tenant (upsert semantics)
// ---------------------------------------------------------------------------

export async function getBrandVoice(
  db: Database,
  tenantId: string,
): Promise<BrandVoice | null> {
  const rows = await db
    .select()
    .from(brainBrandVoice)
    .where(eq(brainBrandVoice.tenantId, tenantId))
    .orderBy(desc(brainBrandVoice.version))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenantId,
    version: row.version,
    tone: row.tone,
    description: row.description ?? '',
    wordsToUse: (row.wordsToUse as string[]) ?? [],
    wordsToAvoid: (row.wordsToAvoid as string[]) ?? [],
    examples: (row.examples as string[]) ?? [],
    updatedAt: row.updatedAt,
  };
}

export async function upsertBrandVoice(
  db: Database,
  tenantId: string,
  input: BrandVoiceInput,
  actor: string = 'system',
): Promise<BrandVoice> {
  const existing = await getBrandVoice(db, tenantId);

  if (existing) {
    const [updated] = await db
      .update(brainBrandVoice)
      .set({
        tone: input.tone ?? existing.tone,
        description: input.description ?? existing.description,
        wordsToUse: input.wordsToUse ?? existing.wordsToUse,
        wordsToAvoid: input.wordsToAvoid ?? existing.wordsToAvoid,
        examples: input.examples ?? existing.examples,
        version: existing.version + 1,
        updatedBy: actor,
        updatedAt: new Date(),
      })
      .where(eq(brainBrandVoice.id, existing.id))
      .returning();
    if (!updated) throw new Error('Failed to update brand voice');

    await logAction(db, tenantId, 'data_access', actor, {
      kind: 'brain_brand_update',
      version: updated.version,
    });

    return {
      id: updated.id,
      tenantId: updated.tenantId,
      version: updated.version,
      tone: updated.tone,
      description: updated.description ?? '',
      wordsToUse: (updated.wordsToUse as string[]) ?? [],
      wordsToAvoid: (updated.wordsToAvoid as string[]) ?? [],
      examples: (updated.examples as string[]) ?? [],
      updatedAt: updated.updatedAt,
    };
  }

  const [created] = await db
    .insert(brainBrandVoice)
    .values({
      tenantId,
      tone: input.tone ?? 'professional',
      description: input.description ?? null,
      wordsToUse: input.wordsToUse ?? [],
      wordsToAvoid: input.wordsToAvoid ?? [],
      examples: input.examples ?? [],
      updatedBy: actor,
    })
    .returning();
  if (!created) throw new Error('Failed to create brand voice');

  await logAction(db, tenantId, 'data_access', actor, {
    kind: 'brain_brand_create',
  });

  return {
    id: created.id,
    tenantId: created.tenantId,
    version: created.version,
    tone: created.tone,
    description: created.description ?? '',
    wordsToUse: (created.wordsToUse as string[]) ?? [],
    wordsToAvoid: (created.wordsToAvoid as string[]) ?? [],
    examples: (created.examples as string[]) ?? [],
    updatedAt: created.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Personas — many per tenant
// ---------------------------------------------------------------------------

export async function listPersonas(
  db: Database,
  tenantId: string,
): Promise<Persona[]> {
  const rows = await db
    .select()
    .from(brainPersonas)
    .where(eq(brainPersonas.tenantId, tenantId))
    .orderBy(desc(brainPersonas.isPrimary), desc(brainPersonas.updatedAt));
  return rows.map(mapPersonaRow);
}

export async function getPrimaryPersona(
  db: Database,
  tenantId: string,
): Promise<Persona | null> {
  const rows = await db
    .select()
    .from(brainPersonas)
    .where(and(eq(brainPersonas.tenantId, tenantId), eq(brainPersonas.isPrimary, true)))
    .limit(1);
  const row = rows[0];
  return row ? mapPersonaRow(row) : null;
}

export async function createPersona(
  db: Database,
  tenantId: string,
  input: PersonaInput,
  actor: string = 'system',
): Promise<Persona> {
  const [created] = await db
    .insert(brainPersonas)
    .values({
      tenantId,
      name: input.name,
      description: input.description ?? null,
      attributes: (input.attributes ?? {}) as any,
      isPrimary: input.isPrimary ?? false,
    })
    .returning();
  if (!created) throw new Error('Failed to create persona');

  await logAction(db, tenantId, 'data_access', actor, {
    kind: 'brain_persona_create',
    personaId: created.id,
  });

  return mapPersonaRow(created);
}

export async function updatePersona(
  db: Database,
  tenantId: string,
  personaId: string,
  input: Partial<PersonaInput>,
  actor: string = 'system',
): Promise<Persona> {
  const [updated] = await db
    .update(brainPersonas)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.attributes !== undefined && { attributes: input.attributes as any }),
      ...(input.isPrimary !== undefined && { isPrimary: input.isPrimary }),
      updatedAt: new Date(),
    })
    .where(and(eq(brainPersonas.id, personaId), eq(brainPersonas.tenantId, tenantId)))
    .returning();
  if (!updated) throw new Error('Persona not found');

  await logAction(db, tenantId, 'data_access', actor, {
    kind: 'brain_persona_update',
    personaId,
  });

  return mapPersonaRow(updated);
}

export async function deletePersona(
  db: Database,
  tenantId: string,
  personaId: string,
  actor: string = 'system',
): Promise<void> {
  await db
    .delete(brainPersonas)
    .where(and(eq(brainPersonas.id, personaId), eq(brainPersonas.tenantId, tenantId)));
  await logAction(db, tenantId, 'data_access', actor, {
    kind: 'brain_persona_delete',
    personaId,
  });
}

function mapPersonaRow(row: any): Persona {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    description: row.description ?? '',
    attributes: (row.attributes as any) ?? {},
    version: row.version,
    isPrimary: !!row.isPrimary,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Products — many per tenant
// ---------------------------------------------------------------------------

export async function listProducts(
  db: Database,
  tenantId: string,
): Promise<Product[]> {
  const rows = await db
    .select()
    .from(brainProducts)
    .where(eq(brainProducts.tenantId, tenantId))
    .orderBy(desc(brainProducts.updatedAt));
  return rows.map(mapProductRow);
}

export async function createProduct(
  db: Database,
  tenantId: string,
  input: ProductInput,
  actor: string = 'system',
): Promise<Product> {
  const [created] = await db
    .insert(brainProducts)
    .values({
      tenantId,
      name: input.name,
      description: input.description ?? null,
      price: input.price ?? null,
      attributes: (input.attributes ?? {}) as any,
    })
    .returning();
  if (!created) throw new Error('Failed to create product');

  await logAction(db, tenantId, 'data_access', actor, {
    kind: 'brain_product_create',
    productId: created.id,
  });

  return mapProductRow(created);
}

export async function updateProduct(
  db: Database,
  tenantId: string,
  productId: string,
  input: Partial<ProductInput>,
  actor: string = 'system',
): Promise<Product> {
  const [updated] = await db
    .update(brainProducts)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.price !== undefined && { price: input.price }),
      ...(input.attributes !== undefined && { attributes: input.attributes as any }),
      updatedAt: new Date(),
    })
    .where(and(eq(brainProducts.id, productId), eq(brainProducts.tenantId, tenantId)))
    .returning();
  if (!updated) throw new Error('Product not found');

  await logAction(db, tenantId, 'data_access', actor, {
    kind: 'brain_product_update',
    productId,
  });

  return mapProductRow(updated);
}

export async function deleteProduct(
  db: Database,
  tenantId: string,
  productId: string,
  actor: string = 'system',
): Promise<void> {
  await db
    .delete(brainProducts)
    .where(and(eq(brainProducts.id, productId), eq(brainProducts.tenantId, tenantId)));
  await logAction(db, tenantId, 'data_access', actor, {
    kind: 'brain_product_delete',
    productId,
  });
}

function mapProductRow(row: any): Product {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    description: row.description ?? '',
    price: row.price ?? '',
    attributes: (row.attributes as any) ?? {},
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Campaign learnings — append-only
// ---------------------------------------------------------------------------

export async function appendLearning(
  db: Database,
  tenantId: string,
  input: CampaignLearningInput,
  actor: string = 'system',
): Promise<CampaignLearning> {
  const [created] = await db
    .insert(brainCampaignLearnings)
    .values({
      tenantId,
      campaignId: input.campaignId ?? null,
      lesson: input.lesson,
      category: input.category ?? 'insight',
      metricSnapshot: (input.metricSnapshot ?? {}) as any,
    })
    .returning();
  if (!created) throw new Error('Failed to append learning');

  await logAction(db, tenantId, 'data_access', actor, {
    kind: 'brain_learning_append',
    learningId: created.id,
  });

  return {
    id: created.id,
    tenantId: created.tenantId,
    campaignId: created.campaignId,
    lesson: created.lesson,
    category: (created.category as any) ?? 'insight',
    metricSnapshot: (created.metricSnapshot as any) ?? {},
    createdAt: created.createdAt,
  };
}

export async function listLearnings(
  db: Database,
  tenantId: string,
  limit: number = 20,
): Promise<CampaignLearning[]> {
  const rows = await db
    .select()
    .from(brainCampaignLearnings)
    .where(eq(brainCampaignLearnings.tenantId, tenantId))
    .orderBy(desc(brainCampaignLearnings.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    tenantId: row.tenantId,
    campaignId: row.campaignId,
    lesson: row.lesson,
    category: (row.category as any) ?? 'insight',
    metricSnapshot: (row.metricSnapshot as any) ?? {},
    createdAt: row.createdAt,
  }));
}

// ---------------------------------------------------------------------------
// Snapshot — compose a full brain view for generation consumers
// ---------------------------------------------------------------------------

export async function getSnapshot(
  db: Database,
  tenantId: string,
): Promise<BrainSnapshot> {
  const [
    brandVoice,
    personas,
    products,
    recentLearnings,
    marketPosition,
    salesPlaybook,
    marketingStrategy,
  ] = await Promise.all([
    getBrandVoice(db, tenantId),
    listPersonas(db, tenantId),
    listProducts(db, tenantId),
    listLearnings(db, tenantId, 10),
    getMarketPosition(db, tenantId),
    getSalesPlaybook(db, tenantId),
    getMarketingStrategy(db, tenantId),
  ]);

  const primaryPersona = personas.find((p) => p.isPrimary) ?? personas[0] ?? null;

  return {
    tenantId,
    brandVoice,
    personas,
    primaryPersona,
    products,
    recentLearnings,
    marketPosition,
    salesPlaybook,
    marketingStrategy,
  };
}

// ─── Market Position (doc 10 §4) ────────────────────────────────────

function mapMarketPositionRow(row: any): MarketPosition {
  return {
    id: row.id,
    tenantId: row.tenantId,
    version: row.version,
    swot: (row.swot as MarketPosition['swot']) ?? {},
    differentiation: row.differentiation ?? '',
    positioningStatement: row.positioningStatement ?? '',
    targetMarket: row.targetMarket ?? '',
    updatedAt: row.updatedAt,
  };
}

export async function getMarketPosition(
  db: Database,
  tenantId: string,
): Promise<MarketPosition | null> {
  const rows = await db
    .select()
    .from(brainMarketPosition)
    .where(eq(brainMarketPosition.tenantId, tenantId))
    .orderBy(desc(brainMarketPosition.version))
    .limit(1);
  const row = rows[0];
  return row ? mapMarketPositionRow(row) : null;
}

export async function upsertMarketPosition(
  db: Database,
  tenantId: string,
  input: MarketPositionInput,
  actor: string = 'system',
): Promise<MarketPosition> {
  const existing = await getMarketPosition(db, tenantId);

  if (existing) {
    const [updated] = await db
      .update(brainMarketPosition)
      .set({
        swot: (input.swot ?? existing.swot) as any,
        differentiation:
          input.differentiation !== undefined ? input.differentiation : existing.differentiation,
        positioningStatement:
          input.positioningStatement !== undefined
            ? input.positioningStatement
            : existing.positioningStatement,
        targetMarket: input.targetMarket !== undefined ? input.targetMarket : existing.targetMarket,
        version: existing.version + 1,
        updatedBy: actor,
        updatedAt: new Date(),
      })
      .where(eq(brainMarketPosition.id, existing.id))
      .returning();
    if (!updated) throw new Error('Failed to update market position');

    await logAction(db, tenantId, 'data_access', actor, {
      kind: 'brain_market_position_update',
      version: updated.version,
    });
    return mapMarketPositionRow(updated);
  }

  const [created] = await db
    .insert(brainMarketPosition)
    .values({
      tenantId,
      swot: (input.swot ?? {}) as any,
      differentiation: input.differentiation ?? null,
      positioningStatement: input.positioningStatement ?? null,
      targetMarket: input.targetMarket ?? null,
      updatedBy: actor,
    })
    .returning();
  if (!created) throw new Error('Failed to create market position');

  await logAction(db, tenantId, 'data_access', actor, {
    kind: 'brain_market_position_create',
  });
  return mapMarketPositionRow(created);
}

// ─── Sales Playbook (doc 10 §4) ─────────────────────────────────────

function mapSalesPlaybookRow(row: any): SalesPlaybook {
  return {
    id: row.id,
    tenantId: row.tenantId,
    version: row.version,
    idealCustomerProfile: row.idealCustomerProfile ?? '',
    qualificationRules: (row.qualificationRules as string[]) ?? [],
    stages: (row.stages as SalesPlaybook['stages']) ?? [],
    objections: (row.objections as SalesPlaybook['objections']) ?? [],
    closingLines: (row.closingLines as string[]) ?? [],
    emailTemplates: (row.emailTemplates as SalesPlaybook['emailTemplates']) ?? [],
    updatedAt: row.updatedAt,
  };
}

export async function getSalesPlaybook(
  db: Database,
  tenantId: string,
): Promise<SalesPlaybook | null> {
  const rows = await db
    .select()
    .from(brainSalesPlaybook)
    .where(eq(brainSalesPlaybook.tenantId, tenantId))
    .orderBy(desc(brainSalesPlaybook.version))
    .limit(1);
  const row = rows[0];
  return row ? mapSalesPlaybookRow(row) : null;
}

export async function upsertSalesPlaybook(
  db: Database,
  tenantId: string,
  input: SalesPlaybookInput,
  actor: string = 'system',
): Promise<SalesPlaybook> {
  const existing = await getSalesPlaybook(db, tenantId);

  if (existing) {
    const [updated] = await db
      .update(brainSalesPlaybook)
      .set({
        idealCustomerProfile:
          input.idealCustomerProfile !== undefined
            ? input.idealCustomerProfile
            : existing.idealCustomerProfile,
        qualificationRules:
          input.qualificationRules !== undefined
            ? input.qualificationRules
            : existing.qualificationRules,
        stages: (input.stages !== undefined ? input.stages : existing.stages) as any,
        objections: (input.objections !== undefined ? input.objections : existing.objections) as any,
        closingLines:
          input.closingLines !== undefined ? input.closingLines : existing.closingLines,
        emailTemplates: (input.emailTemplates !== undefined
          ? input.emailTemplates
          : existing.emailTemplates) as any,
        version: existing.version + 1,
        updatedBy: actor,
        updatedAt: new Date(),
      })
      .where(eq(brainSalesPlaybook.id, existing.id))
      .returning();
    if (!updated) throw new Error('Failed to update sales playbook');

    await logAction(db, tenantId, 'data_access', actor, {
      kind: 'brain_sales_playbook_update',
      version: updated.version,
    });
    return mapSalesPlaybookRow(updated);
  }

  const [created] = await db
    .insert(brainSalesPlaybook)
    .values({
      tenantId,
      idealCustomerProfile: input.idealCustomerProfile ?? null,
      qualificationRules: input.qualificationRules ?? [],
      stages: (input.stages ?? []) as any,
      objections: (input.objections ?? []) as any,
      closingLines: input.closingLines ?? [],
      emailTemplates: (input.emailTemplates ?? []) as any,
      updatedBy: actor,
    })
    .returning();
  if (!created) throw new Error('Failed to create sales playbook');

  await logAction(db, tenantId, 'data_access', actor, {
    kind: 'brain_sales_playbook_create',
  });
  return mapSalesPlaybookRow(created);
}

// ─── Marketing Strategy (doc 10 §4) ─────────────────────────────────

function mapMarketingStrategyRow(row: any): MarketingStrategy {
  return {
    id: row.id,
    tenantId: row.tenantId,
    version: row.version,
    channels: (row.channels as MarketingStrategy['channels']) ?? [],
    monthlyBudget: row.monthlyBudget ?? '',
    themes: (row.themes as MarketingStrategy['themes']) ?? [],
    funnelStages: (row.funnelStages as string[]) ?? [],
    kpis: (row.kpis as MarketingStrategy['kpis']) ?? [],
    updatedAt: row.updatedAt,
  };
}

export async function getMarketingStrategy(
  db: Database,
  tenantId: string,
): Promise<MarketingStrategy | null> {
  const rows = await db
    .select()
    .from(brainMarketingStrategy)
    .where(eq(brainMarketingStrategy.tenantId, tenantId))
    .orderBy(desc(brainMarketingStrategy.version))
    .limit(1);
  const row = rows[0];
  return row ? mapMarketingStrategyRow(row) : null;
}

export async function upsertMarketingStrategy(
  db: Database,
  tenantId: string,
  input: MarketingStrategyInput,
  actor: string = 'system',
): Promise<MarketingStrategy> {
  const existing = await getMarketingStrategy(db, tenantId);

  if (existing) {
    const [updated] = await db
      .update(brainMarketingStrategy)
      .set({
        channels: (input.channels !== undefined ? input.channels : existing.channels) as any,
        monthlyBudget:
          input.monthlyBudget !== undefined ? input.monthlyBudget : existing.monthlyBudget,
        themes: (input.themes !== undefined ? input.themes : existing.themes) as any,
        funnelStages:
          input.funnelStages !== undefined ? input.funnelStages : existing.funnelStages,
        kpis: (input.kpis !== undefined ? input.kpis : existing.kpis) as any,
        version: existing.version + 1,
        updatedBy: actor,
        updatedAt: new Date(),
      })
      .where(eq(brainMarketingStrategy.id, existing.id))
      .returning();
    if (!updated) throw new Error('Failed to update marketing strategy');

    await logAction(db, tenantId, 'data_access', actor, {
      kind: 'brain_marketing_strategy_update',
      version: updated.version,
    });
    return mapMarketingStrategyRow(updated);
  }

  const [created] = await db
    .insert(brainMarketingStrategy)
    .values({
      tenantId,
      channels: (input.channels ?? []) as any,
      monthlyBudget: input.monthlyBudget ?? null,
      themes: (input.themes ?? []) as any,
      funnelStages: input.funnelStages ?? [],
      kpis: (input.kpis ?? []) as any,
      updatedBy: actor,
    })
    .returning();
  if (!created) throw new Error('Failed to create marketing strategy');

  await logAction(db, tenantId, 'data_access', actor, {
    kind: 'brain_marketing_strategy_create',
  });
  return mapMarketingStrategyRow(created);
}

/**
 * Render the brain snapshot as a compact text block suitable for injection
 * into an LLM system prompt. Returns empty string if the brain is empty.
 */
export function snapshotToPromptBlock(snapshot: BrainSnapshot): string {
  const parts: string[] = [];

  if (snapshot.brandVoice) {
    const bv = snapshot.brandVoice;
    parts.push(`BRAND VOICE:\n- Tone: ${bv.tone}`);
    if (bv.description) parts.push(`- Style: ${bv.description}`);
    if (bv.wordsToUse.length) parts.push(`- Prefer: ${bv.wordsToUse.slice(0, 10).join(', ')}`);
    if (bv.wordsToAvoid.length) parts.push(`- Avoid: ${bv.wordsToAvoid.slice(0, 10).join(', ')}`);
  }

  if (snapshot.primaryPersona) {
    const p = snapshot.primaryPersona;
    const attrs = p.attributes ?? {};
    parts.push(`\nPRIMARY CUSTOMER: ${p.name}`);
    if (p.description) parts.push(`- ${p.description}`);
    if (attrs.painPoints?.length) {
      parts.push(`- Pain points: ${attrs.painPoints.slice(0, 5).join('; ')}`);
    }
    if (attrs.goals?.length) {
      parts.push(`- Goals: ${attrs.goals.slice(0, 5).join('; ')}`);
    }
  }

  if (snapshot.products.length) {
    parts.push(`\nPRODUCTS (${snapshot.products.length}):`);
    for (const product of snapshot.products.slice(0, 5)) {
      const line = `- ${product.name}${product.price ? ` (${product.price})` : ''}`;
      parts.push(line);
      if (product.description) parts.push(`  ${product.description.substring(0, 120)}`);
    }
  }

  if (snapshot.recentLearnings.length) {
    const wins = snapshot.recentLearnings.filter((l) => l.category === 'win').slice(0, 3);
    if (wins.length) {
      parts.push(`\nWHAT HAS WORKED BEFORE:`);
      wins.forEach((w) => parts.push(`- ${w.lesson.substring(0, 200)}`));
    }
  }

  return parts.join('\n');
}
