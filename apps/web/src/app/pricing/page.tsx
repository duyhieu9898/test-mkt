'use client';

// TODO: i18n — hardcoded English for marketing page. Revisit when plan localization
// becomes necessary (likely after first paying customers in VN/JP markets).

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  Sparkles,
  Check,
  ArrowRight,
  Star,
  Users,
  Gem,
  Zap,
  Shield,
  Package,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1';

type PlanKey = 'free' | 'pro' | 'team' | 'business' | 'enterprise';

interface Plan {
  key: PlanKey;
  label: string;
  monthly: number | null;
  yearly: number | null;
  grant: number | null;
  seats: number;
  byoDisc: number;
  description: string;
  features: string[];
  cta: string;
  popular?: boolean;
  recommended?: boolean;
}

const PLANS: Plan[] = [
  {
    key: 'free',
    label: 'Free',
    monthly: 0,
    yearly: 0,
    grant: 100,
    seats: 1,
    byoDisc: 0,
    description: 'Try it. Generate a few campaigns to see how it works.',
    features: [
      '100 credits per month',
      '1 Business Brain',
      'Cloud mode only',
      'Community support',
    ],
    cta: 'Start free',
  },
  {
    key: 'pro',
    label: 'Pro',
    monthly: 29,
    yearly: 279,
    grant: 500,
    seats: 1,
    byoDisc: 30,
    description: 'For solopreneurs and freelancers running marketing solo.',
    features: [
      '500 credits per month',
      'Bring your own API key (-30%)',
      '1-month rollover',
      'Email support',
      'Cloud + Private Cloud',
    ],
    cta: 'Start Pro trial',
    popular: true,
  },
  {
    key: 'team',
    label: 'Team',
    monthly: 99,
    yearly: 950,
    grant: 2000,
    seats: 5,
    byoDisc: 30,
    description: 'Shared credits across your marketing team.',
    features: [
      '2,000 credits per month (shared)',
      '5 team seats',
      'BYO API key (-30%)',
      'Priority email support',
    ],
    cta: 'Start Team trial',
    recommended: true,
  },
  {
    key: 'business',
    label: 'Business',
    monthly: 299,
    yearly: 2870,
    grant: 8000,
    seats: 15,
    byoDisc: 30,
    description: 'Agency / growing company. On-premise unlocked.',
    features: [
      '8,000 credits per month',
      '15 team seats',
      'On-Premise mode',
      'Priority phone support',
      'Custom integrations',
    ],
    cta: 'Start Business trial',
  },
  {
    key: 'enterprise',
    label: 'Enterprise',
    monthly: null,
    yearly: null,
    grant: null,
    seats: 999,
    byoDisc: 0,
    description: 'On-prem, custom models, SLA, dedicated support.',
    features: [
      'Unlimited credits',
      'Unlimited seats',
      'Custom LLM fine-tuning',
      '99.9% SLA',
      'Dedicated success engineer',
    ],
    cta: 'Contact sales',
  },
];

const TOPUP_PACKS = [
  { label: 'Small', credits: 500, price: 10 },
  { label: 'Medium', credits: 2000, price: 30 },
  { label: 'Large', credits: 10000, price: 99 },
  { label: 'Bulk', credits: 50000, price: 399 },
];

const COMPARISON_ACTIONS: Array<{ action: string; cost: string }> = [
  { action: 'Social post (Balanced)', cost: '2 credits' },
  { action: 'Banner copywriting', cost: '3 credits' },
  { action: 'SEO article (Balanced)', cost: '8 credits' },
  { action: 'Landing page draft', cost: '12 credits' },
  { action: 'Full campaign', cost: '50 credits' },
  { action: 'View dashboard', cost: 'free' },
  { action: 'Export your data', cost: 'free' },
  { action: 'Refresh tracking', cost: '1 credit' },
];

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'What exactly is a credit?',
    a: 'A credit is a unit of work. Each action (writing a post, generating a banner, running a campaign) costs a fixed number of credits based on the quality tier you pick (Fast / Balanced / Premium). One balance covers everything — no separate billing for features.',
  },
  {
    q: 'Do unused credits roll over?',
    a: 'Pro plans get 1 month of rollover. Team, Business and Enterprise plans get 3 months of rollover on monthly plans, 12 months on annual plans. Top-up credits never expire.',
  },
  {
    q: 'What happens if I run out of credits?',
    a: 'You can buy a top-up pack anytime (starting at $10 for 500 credits), upgrade to a higher plan, or wait until your monthly grant refreshes. Top-up credits are consumed AFTER your monthly grant, and never expire.',
  },
  {
    q: 'Can I bring my own API key?',
    a: "Yes — Pro, Team and Business plans all support Bring Your Own Key (OpenAI, Anthropic, Google). When you use your own key, credit costs drop by 30%. For self-hosted models, the cost drops to near-zero — you only pay for the orchestration.",
  },
  {
    q: 'Can I switch plans later?',
    a: "Yes. Upgrade or downgrade at any time. When you upgrade, we prorate your new plan and add the additional credits to your balance immediately. When you downgrade, the change takes effect at the next billing cycle.",
  },
  {
    q: 'Is there a free trial for paid plans?',
    a: "Pro, Team and Business plans come with a 14-day free trial. No credit card required to start — we'll ask for payment details only if you decide to continue after the trial.",
  },
];

export default function PricingPage() {
  const router = useRouter();
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [loadingPlan, setLoadingPlan] = useState<PlanKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout(plan: PlanKey) {
    if (plan === 'free') {
      router.push('/register');
      return;
    }
    if (plan === 'enterprise') {
      window.location.href = 'https://bap-software.net/contact/';
      return;
    }

    setError(null);
    setLoadingPlan(plan);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;

      if (!token) {
        router.push(`/register?next=/pricing&plan=${plan}`);
        return;
      }

      const res = await fetch(`${API_URL}/billing/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan, cycle: billingCycle }),
      });

      if (res.status === 503) {
        setError(
          'Online billing is not yet configured on this instance. Please contact us to upgrade manually.'
        );
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Checkout failed');
      }

      const data = (await res.json()) as { url?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to start checkout');
    } finally {
      setLoadingPlan(null);
    }
  }

  function priceLabel(plan: Plan) {
    if (plan.monthly === null) return 'Custom';
    if (plan.monthly === 0) return '$0';
    return billingCycle === 'monthly'
      ? `$${plan.monthly}`
      : `$${Math.round((plan.yearly ?? 0) / 12)}`;
  }

  function priceSuffix(plan: Plan) {
    if (plan.monthly === null) return '';
    if (plan.monthly === 0) return 'forever';
    return '/ month';
  }

  function yearlySavings(plan: Plan) {
    if (!plan.monthly || !plan.yearly) return null;
    const full = plan.monthly * 12;
    const save = full - plan.yearly;
    if (save <= 0) return null;
    return `Save $${save}/year`;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 glass border-b">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold">1Person</span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <Link href="/#features" className="text-muted-foreground hover:text-foreground transition">
              Features
            </Link>
            <Link href="/pricing" className="text-foreground font-medium">
              Pricing
            </Link>
            <Link href="/blog" className="text-muted-foreground hover:text-foreground transition">
              Blog
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
            </Link>
            <Link href="/register">
              <Button variant="gradient" size="sm">
                Get started
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-12 px-6">
        <div className="container mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            <Gem className="w-4 h-4" />
            <span>Credit-based pricing</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold mb-4 tracking-tight">
            Credits power everything.
            <br />
            <span className="gradient-text">Pick a plan that fits your usage.</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            One balance. One simple model. No per-feature pricing rabbit holes.
          </p>

          {/* Billing toggle */}
          <div className="inline-flex items-center gap-2 p-1 rounded-full border bg-card">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-5 py-2 rounded-full text-sm font-medium transition ${
                billingCycle === 'monthly'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-5 py-2 rounded-full text-sm font-medium transition flex items-center gap-2 ${
                billingCycle === 'yearly'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Yearly
              <span className="text-xs bg-green-500/20 text-green-600 px-2 py-0.5 rounded-full">
                -20%
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Plan cards */}
      <section className="pb-20 px-6">
        <div className="container mx-auto max-w-7xl">
          {error && (
            <div className="max-w-2xl mx-auto mb-8 p-4 rounded-lg border border-destructive/30 bg-destructive/5 text-sm text-destructive text-center">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
            {PLANS.map((plan, i) => {
              const isLoading = loadingPlan === plan.key;
              const savings = yearlySavings(plan);
              return (
                <motion.div
                  key={plan.key}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  viewport={{ once: true }}
                  className={`relative rounded-2xl border p-6 flex flex-col ${
                    plan.popular
                      ? 'border-primary bg-primary/5 shadow-lg xl:scale-105 z-10'
                      : plan.recommended
                        ? 'border-amber-500/50 bg-amber-500/5'
                        : 'bg-card'
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 whitespace-nowrap">
                      <Star className="w-3 h-3 fill-current" />
                      Most popular
                    </div>
                  )}
                  {plan.recommended && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-white px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 whitespace-nowrap">
                      <Users className="w-3 h-3" />
                      For teams
                    </div>
                  )}

                  <h3 className="text-xl font-bold mb-1">{plan.label}</h3>
                  <p className="text-xs text-muted-foreground mb-4 min-h-[32px]">
                    {plan.description}
                  </p>

                  <div className="mb-2">
                    <span className="text-3xl font-bold">{priceLabel(plan)}</span>
                    {priceSuffix(plan) && (
                      <span className="text-sm text-muted-foreground ml-1">
                        {priceSuffix(plan)}
                      </span>
                    )}
                  </div>
                  {billingCycle === 'yearly' && savings && (
                    <div className="text-xs text-green-600 font-medium mb-3">{savings}</div>
                  )}
                  {billingCycle === 'yearly' && plan.yearly && plan.yearly > 0 && (
                    <div className="text-xs text-muted-foreground mb-3">
                      Billed ${plan.yearly}/year
                    </div>
                  )}

                  <div className="py-3 border-y mb-4">
                    <div className="text-sm font-semibold">
                      {plan.grant === null
                        ? 'Unlimited credits'
                        : `${plan.grant.toLocaleString()} credits / month`}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {plan.key === 'enterprise'
                        ? 'Unlimited seats'
                        : `${plan.seats} ${plan.seats === 1 ? 'seat' : 'seats'}`}
                    </div>
                  </div>

                  <ul className="space-y-2 mb-6 flex-1">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-xs">
                        <Check className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  {plan.byoDisc > 0 && (
                    <div className="text-xs text-muted-foreground mb-3 italic">
                      Bring your own API key: -{plan.byoDisc}% cost
                    </div>
                  )}

                  <Button
                    size="sm"
                    variant={plan.popular ? 'gradient' : 'outline'}
                    className="w-full"
                    disabled={isLoading}
                    onClick={() => handleCheckout(plan.key)}
                  >
                    {isLoading ? 'Loading…' : plan.cta}
                    {!isLoading && <ArrowRight className="w-3.5 h-3.5 ml-1.5" />}
                  </Button>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Top-up packs */}
      <section className="pb-20 px-6">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 text-amber-600 text-sm font-medium mb-4">
              <Package className="w-4 h-4" />
              <span>Top-up packs</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-3">Buy extra credits anytime</h2>
            <p className="text-muted-foreground">
              Need more credits this month? Top-up packs never expire.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {TOPUP_PACKS.map((pack) => (
              <div
                key={pack.label}
                className="rounded-2xl border bg-card p-6 text-center hover:shadow-lg transition"
              >
                <div className="text-sm text-muted-foreground font-medium mb-2">{pack.label}</div>
                <div className="text-2xl font-bold gradient-text mb-1">
                  {pack.credits.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground mb-4">credits</div>
                <div className="text-lg font-semibold">${pack.price}</div>
              </div>
            ))}
          </div>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Top-up credits never expire and are consumed after your monthly grant.
          </p>
        </div>
      </section>

      {/* Action cost comparison */}
      <section className="pb-20 px-6">
        <div className="container mx-auto max-w-3xl">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold mb-3">What things cost</h2>
            <p className="text-muted-foreground">
              Same cost on every plan. Quality tier (Fast / Balanced / Premium) is picked per action.
            </p>
          </div>

          <div className="rounded-2xl border bg-card overflow-hidden">
            <div className="divide-y">
              {COMPARISON_ACTIONS.map((row) => (
                <div key={row.action} className="px-6 py-4 flex items-center justify-between">
                  <span className="font-medium text-sm">{row.action}</span>
                  <span
                    className={`font-mono text-sm ${
                      row.cost === 'free' ? 'text-green-600 font-semibold' : 'text-primary'
                    }`}
                  >
                    {row.cost}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-4 flex items-center justify-center gap-2">
            <Zap className="w-3 h-3" />
            Premium tier can cost 3x Balanced. Fast tier roughly 1/3 the cost.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="pb-20 px-6">
        <div className="container mx-auto max-w-3xl">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-10">
            Frequently asked questions
          </h2>

          <div className="space-y-4">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="group rounded-xl border bg-card p-5 open:shadow-md transition"
              >
                <summary className="flex items-center justify-between cursor-pointer list-none">
                  <span className="font-semibold">{item.q}</span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground transition group-open:rotate-90" />
                </summary>
                <p className="mt-4 text-sm text-muted-foreground leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>

          <div className="mt-12 text-center">
            <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Shield className="w-4 h-4" />
              Secure payment by Stripe · Cancel anytime · No hidden fees
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12 px-6">
        <div className="container mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold">1Person</span>
            </div>
            <p className="text-muted-foreground text-sm">
              1Person. AI Company OS is developed by{' '}
              <a
                href="https://bap.jp"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                BAP
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
