import Stripe from 'stripe';

let instance: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!instance) {
    instance = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-12-18.acacia' as any,
    });
  }
  return instance;
}

export const stripeConfig = {
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  priceIds: {
    pro: process.env.STRIPE_PRICE_PRO || 'price_pro_placeholder',
    business: process.env.STRIPE_PRICE_BUSINESS || 'price_business_placeholder',
  },
  webUrl: process.env.WEB_URL || 'http://localhost:3004',
};
