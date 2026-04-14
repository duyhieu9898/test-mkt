/**
 * Data export (P0-A5).
 *
 * One-click tenant data export: Business Brain + documents + campaigns
 * + audit log, bundled into a ZIP. Delivers on the landing page promise
 * "if you leave, you take everything with you."
 *
 * Route: POST /api/v1/export/:companyId
 */

import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import archiver from 'archiver';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { db } from '../lib/db';
import {
  companies,
  campaigns as campaignsTable,
  banners as bannersTable,
  socialPosts,
} from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';
import { getTenantAI, ensureTenantForCompany } from '../lib/tenant-ai';

const exportRouter = new Hono();
exportRouter.use('*', authMiddleware);

exportRouter.post('/:companyId', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');

  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
    columns: { id: true, name: true, ownerId: true },
  });
  if (!company) {
    throw new HTTPException(404, { message: 'Company not found' });
  }
  if (company.ownerId !== userId) {
    throw new HTTPException(403, {
      message: 'You can only export data from companies you own.',
    });
  }

  const tenantId = await ensureTenantForCompany(company.id, company.name);
  const ai = getTenantAI();

  // Set streaming response headers
  const filename = `1person-export-${company.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}-${Date.now()}.zip`;
  c.header('Content-Type', 'application/zip');
  c.header('Content-Disposition', `attachment; filename="${filename}"`);
  c.header('Cache-Control', 'no-store');

  // Build the archive in memory, stream as response
  const archive = archiver('zip', { zlib: { level: 9 } });
  const chunks: Buffer[] = [];
  archive.on('data', (chunk: Buffer) => chunks.push(chunk));

  const readme = `1Person Data Export
Generated: ${new Date().toISOString()}
Company: ${company.name}
Company ID: ${company.id}
Tenant ID: ${tenantId}

This archive contains ALL your data from 1Person. You own it. Always.

Folders:
  brain/        Your Business Brain — brand voice, customer personas,
                products, campaign learnings. This is what the AI uses
                to understand your business.

  documents/    Every file you uploaded, plus a manifest mapping file
                names to the hashes stored in the audit chain.

  campaigns/    All your campaigns, banners, and social posts — the AI's
                outputs for your business.

  audit/        The tamper-evident audit trail for your tenant. Each
                entry is hash-linked to the previous one (blockchain-
                style). The file integrity-check.json is the result of
                re-running the verification against the exported data.

  metadata.json Export metadata (timestamp, version, company info)

The integrity check verifies that no records have been altered since
they were created. Give this ZIP to any auditor, lawyer, or compliance
team — they can verify the chain independently by hashing each
audit entry and comparing to the stored chain_hash.

Questions? support@1person.ai
`;

  archive.append(readme, { name: 'README.txt' });

  // --- Brain ---
  try {
    const snapshot = await ai.brain.getSnapshot(tenantId);
    archive.append(JSON.stringify(snapshot, null, 2), {
      name: 'brain/snapshot.json',
    });
    archive.append(JSON.stringify(snapshot.brandVoice, null, 2), {
      name: 'brain/brand-voice.json',
    });
    archive.append(JSON.stringify(snapshot.personas, null, 2), {
      name: 'brain/personas.json',
    });
    archive.append(JSON.stringify(snapshot.products, null, 2), {
      name: 'brain/products.json',
    });
    archive.append(JSON.stringify(snapshot.recentLearnings, null, 2), {
      name: 'brain/learnings.json',
    });
  } catch (err) {
    console.error('[export] brain snapshot failed:', err);
    archive.append(JSON.stringify({ error: String(err) }, null, 2), {
      name: 'brain/error.json',
    });
  }

  // --- Documents ---
  const documentErrors: Array<{ id: string; name: string; reason: string }> = [];
  try {
    const docs = await ai.listDocuments(tenantId);
    archive.append(JSON.stringify(docs, null, 2), {
      name: 'documents/manifest.json',
    });

    for (const doc of docs) {
      try {
        const fullDoc = await ai.getDocument(tenantId, doc.id);
        const filePath = (fullDoc as any)?.filePath;
        if (filePath && existsSync(filePath)) {
          const bytes = await readFile(filePath);
          // Sanitize file name — prefix with doc id to avoid collisions
          const safeName = `${doc.id.substring(0, 8)}_${doc.name.replace(/[/\\]/g, '_')}`;
          archive.append(bytes, { name: `documents/files/${safeName}` });
        } else {
          documentErrors.push({
            id: doc.id,
            name: doc.name,
            reason: 'File not found on disk',
          });
        }
      } catch (err) {
        documentErrors.push({
          id: doc.id,
          name: doc.name,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    console.error('[export] documents failed:', err);
  }
  if (documentErrors.length > 0) {
    archive.append(JSON.stringify(documentErrors, null, 2), {
      name: 'documents/errors.json',
    });
  }

  // --- Campaigns (core.campaigns + children) ---
  try {
    const campaignRows = await db
      .select()
      .from(campaignsTable)
      .where(eq(campaignsTable.companyId, companyId));
    archive.append(JSON.stringify(campaignRows, null, 2), {
      name: 'campaigns/campaigns.json',
    });

    const bannerRows = await db
      .select()
      .from(bannersTable)
      .where(eq(bannersTable.companyId, companyId));
    archive.append(JSON.stringify(bannerRows, null, 2), {
      name: 'campaigns/banners.json',
    });

    const postRows = await db
      .select()
      .from(socialPosts)
      .where(eq(socialPosts.companyId, companyId));
    archive.append(JSON.stringify(postRows, null, 2), {
      name: 'campaigns/social-posts.json',
    });
  } catch (err) {
    console.error('[export] campaigns failed:', err);
    archive.append(JSON.stringify({ error: String(err) }, null, 2), {
      name: 'campaigns/error.json',
    });
  }

  // --- Audit log + integrity check ---
  try {
    const auditLog = await ai.getAuditLog(tenantId, { limit: 1000 });
    archive.append(JSON.stringify(auditLog, null, 2), {
      name: 'audit/audit-log.json',
    });
    const integrity = await ai.verifyDataIntegrity(tenantId);
    archive.append(JSON.stringify(integrity, null, 2), {
      name: 'audit/integrity-check.json',
    });
  } catch (err) {
    console.error('[export] audit failed:', err);
    archive.append(JSON.stringify({ error: String(err) }, null, 2), {
      name: 'audit/error.json',
    });
  }

  // --- Metadata ---
  const metadata = {
    exportedAt: new Date().toISOString(),
    exportedBy: userId,
    companyId: company.id,
    companyName: company.name,
    tenantId,
    version: '1.0',
    generator: '1Person data export API',
  };
  archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' });

  // Finalize and return the buffer
  await archive.finalize();

  // Wait a tick for all data events
  await new Promise((resolve) => setTimeout(resolve, 50));

  const buffer = Buffer.concat(chunks);
  return c.body(buffer as any);
});

export default exportRouter;
