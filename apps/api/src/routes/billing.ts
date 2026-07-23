import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../lib/db';
import { companies } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { getStripe, stripeConfig } from '../lib/stripe';
import type Stripe from 'stripe';

const billing = new Hono();

type PlanId = 'free' | 'pro' | 'business';

interface SubscriptionBlob {
  plan: PlanId;
  status: string;
  currentPeriodEnd?: string | null;
  stripeSubscriptionId?: string | null;
  stripeCustomerId?: string | null;
  updatedAt: string;
}

/**
 * Helper: read / write subscription blob on companies.settings JSONB.
 * Uses the first company owned by the user as the billing target.
 */
async function getUserPrimaryCompany(userId: string) {
  return db.query.companies.findFirst({
    where: eq(companies.ownerId, userId),
  });
}

async function writeSubscriptionToCompany(
  companyId: string,
  sub: SubscriptionBlob
) {
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
  });
  if (!company) return;
  const currentSettings = (company.settings as any) || {};
  const newSettings = { ...currentSettings, subscription: sub };
  await db
    .update(companies)
    .set({ settings: newSettings as any, updatedAt: new Date() })
    .where(eq(companies.id, companyId));
}

async function findCompanyByStripeCustomerId(customerId: string) {
  // Naive scan — for MVP only. Post-PMF: add a stripe_customer_id column/index.
  const all = await db.query.companies.findMany();
  return all.find(
    (c) => (c.settings as any)?.subscription?.stripeCustomerId === customerId
  );
}

/**
 * POST /billing/checkout
 * Body: { plan: 'pro' | 'business' }
 * Returns: { url }
 */
billing.post(
  '/checkout',
  authMiddleware,
  zValidator(
    'json',
    z.object({
      plan: z.enum(['pro', 'business']),
    })
  ),
  async (c) => {
    const stripe = getStripe();
    if (!stripe) {
      return c.json(
        { error: 'Billing not configured' },
        503
      );
    }

    const { plan } = c.req.valid('json');
    const { userId } = c.get('user');

    const company = await getUserPrimaryCompany(userId);
    const companyId = company?.id || '';

    const priceId =
      plan === 'pro' ? stripeConfig.priceIds.pro : stripeConfig.priceIds.business;

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${stripeConfig.webUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${stripeConfig.webUrl}/pricing`,
        metadata: {
          userId,
          companyId,
          plan,
        },
        subscription_data: {
          metadata: {
            userId,
            companyId,
            plan,
          },
        },
      });

      return c.json({ url: session.url });
    } catch (err: any) {
      console.error('[billing] checkout error:', err?.message);
      return c.json({ error: 'Failed to create checkout session' }, 500);
    }
  }
);

/**
 * POST /billing/webhook — Stripe webhook
 * No auth. Verifies signature.
 */
billing.post('/webhook', async (c) => {
  const stripe = getStripe();
  if (!stripe) {
    return c.json({ error: 'Billing not configured' }, 503);
  }

  const signature = c.req.header('stripe-signature');
  if (!signature || !stripeConfig.webhookSecret) {
    return c.json({ error: 'Missing signature' }, 400);
  }

  const rawBody = await c.req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      stripeConfig.webhookSecret
    );
  } catch (err: any) {
    console.error('[billing] webhook verify failed:', err?.message);
    return c.json({ error: 'Invalid signature' }, 400);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const companyId = session.metadata?.companyId;
        const plan = (session.metadata?.plan as PlanId) || 'pro';
        if (companyId) {
          await writeSubscriptionToCompany(companyId, {
            plan,
            status: 'active',
            stripeSubscriptionId:
              typeof session.subscription === 'string'
                ? session.subscription
                : session.subscription?.id || null,
            stripeCustomerId:
              typeof session.customer === 'string'
                ? session.customer
                : session.customer?.id || null,
            currentPeriodEnd: null,
            updatedAt: new Date().toISOString(),
          });
          // Also flip the trustai_credit_balances row to the new plan
          // and grant the monthly allocation. Non-fatal — billing
          // success is the primary outcome here.
          try {
            const { getTenantAI } = await import('../lib/tenant-ai');
            const { getCreditTenantIdFromCompanyId } = await import('../lib/credits');
            const tenantId = await getCreditTenantIdFromCompanyId(companyId);
            if (tenantId) {
              const ai = getTenantAI();
              await ai.credits.changePlan(tenantId, plan, {
                customerId:
                  typeof session.customer === 'string'
                    ? session.customer
                    : session.customer?.id || undefined,
                subscriptionId:
                  typeof session.subscription === 'string'
                    ? session.subscription
                    : session.subscription?.id || undefined,
              });
            }
          } catch (err) {
            console.error('[billing] credit plan grant failed (non-fatal):', err);
          }
        }
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
        const company = await findCompanyByStripeCustomerId(customerId);
        if (company) {
          const plan = (sub.metadata?.plan as PlanId) || 'pro';
          await writeSubscriptionToCompany(company.id, {
            plan,
            status: sub.status,
            stripeSubscriptionId: sub.id,
            stripeCustomerId: customerId,
            currentPeriodEnd: new Date(
              (sub as any).current_period_end * 1000
            ).toISOString(),
            updatedAt: new Date().toISOString(),
          });
          // Mirror to credit balance row
          try {
            const { getTenantAI } = await import('../lib/tenant-ai');
            const { getCreditTenantIdFromCompanyId } = await import('../lib/credits');
            const tenantId = await getCreditTenantIdFromCompanyId(company.id);
            if (!tenantId) throw new Error('Credit account wallet not found');
            await getTenantAI().credits.changePlan(tenantId, plan, {
              customerId,
              subscriptionId: sub.id,
            });
          } catch (err) {
            console.error('[billing] credit plan update failed (non-fatal):', err);
          }
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
        const company = await findCompanyByStripeCustomerId(customerId);
        if (company) {
          await writeSubscriptionToCompany(company.id, {
            plan: 'free',
            status: 'canceled',
            stripeSubscriptionId: null,
            stripeCustomerId: customerId,
            currentPeriodEnd: null,
            updatedAt: new Date().toISOString(),
          });
          // Downgrade credit balance to Free
          try {
            const { getTenantAI } = await import('../lib/tenant-ai');
            const { getCreditTenantIdFromCompanyId } = await import('../lib/credits');
            const tenantId = await getCreditTenantIdFromCompanyId(company.id);
            if (!tenantId) throw new Error('Credit account wallet not found');
            await getTenantAI().credits.changePlan(tenantId, 'free');
          } catch (err) {
            console.error('[billing] credit plan downgrade failed (non-fatal):', err);
          }
        }
        break;
      }
      default:
        // no-op for other events
        break;
    }
  } catch (err: any) {
    console.error('[billing] webhook handler error:', err?.message);
    return c.json({ error: 'Handler failed' }, 500);
  }

  return c.json({ received: true });
});

/**
 * GET /billing/subscription — current user's subscription status
 */
billing.get('/subscription', authMiddleware, async (c) => {
  const { userId } = c.get('user');
  const company = await getUserPrimaryCompany(userId);
  if (!company) {
    return c.json({ plan: 'free' });
  }
  const sub = (company.settings as any)?.subscription as
    | SubscriptionBlob
    | undefined;
  if (!sub) {
    return c.json({ plan: 'free' });
  }
  return c.json(sub);
});

export default billing;
