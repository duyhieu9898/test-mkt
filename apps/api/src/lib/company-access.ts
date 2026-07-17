import { and, eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { companies } from '@1person/core/db';
import { db } from './db';

/**
 * Current authorization model is company ownership. Keeping this check in one
 * place makes it straightforward to add company memberships and roles later.
 */
export async function assertCompanyAccess(companyId: string, userId: string) {
  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, companyId), eq(companies.ownerId, userId)),
    columns: { id: true, name: true, ownerId: true },
  });

  if (!company) {
    throw new HTTPException(404, { message: 'Company not found' });
  }

  return company;
}
