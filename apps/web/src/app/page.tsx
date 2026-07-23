'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import {
  Sparkles,
  Bot,
  LineChart,
  Zap,
  Shield,
  ArrowRight,
  Play,
  Lock,
  Database,
  FileSearch,
  ShieldCheck,
  Scale,
  Wallet,
  Globe,
  ChevronDown,
  Brain,
  Eye,
  Rocket,
  Check,
  X,
  Server,
  Download,
  Gem,
  Zap as ZapIcon,
  Star as StarIcon,
} from 'lucide-react';
import { type Locale, locales, localeNames, localeFlags, getTranslations } from '@/lib/i18n';
import { usePreferredAppLanguage } from '@/lib/use-preferred-app-language';

export default function LandingPage() {
  const [locale, setLocale] = useState<Locale>('en');
  const [preferredLanguage, setPreferredLanguage] = usePreferredAppLanguage('en');
  const [langOpen, setLangOpen] = useState(false);
  const tx = getTranslations(locale);

  useEffect(() => {
    setLocale(preferredLanguage === 'ja' ? 'ja' : 'en');
  }, [preferredLanguage]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 glass border-b">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold">1Person</span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <Link href="#features" className="text-muted-foreground hover:text-foreground transition">
              {tx.nav_features}
            </Link>
            <Link href="#security" className="text-muted-foreground hover:text-foreground transition">
              {tx.nav_security}
            </Link>
            <Link href="#pricing" className="text-muted-foreground hover:text-foreground transition">
              {tx.nav_pricing}
            </Link>
            <Link href="/blog" className="text-muted-foreground hover:text-foreground transition">
              {tx.nav_blog}
            </Link>
            <a href="https://bap-software.net/contact/" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition">
              Contact
            </a>
          </div>

          <div className="flex items-center gap-3">
            {/* Language Switcher */}
            <div className="relative">
              <button
                onClick={() => setLangOpen(!langOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm hover:bg-muted transition"
              >
                <Globe className="w-4 h-4" />
                <span>{localeFlags[locale]}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              {langOpen && (
                <div className="absolute right-0 mt-1 bg-card border rounded-lg shadow-lg py-1 min-w-[140px] z-50">
                  {locales.map((l) => (
                    <button
                      key={l}
                      onClick={() => {
                        setLocale(l);
                        setPreferredLanguage(l === 'ja' ? 'ja' : 'en');
                        setLangOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition flex items-center gap-2 ${
                        locale === l ? 'bg-primary/5 text-primary font-medium' : ''
                      }`}
                    >
                      <span>{localeFlags[l]}</span>
                      <span>{localeNames[l]}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Link href="/login">
              <Button variant="ghost" size="sm">{tx.nav_sign_in}</Button>
            </Link>
            <Link href="/register">
              <Button variant="gradient" size="sm">{tx.nav_get_started}</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="container mx-auto text-center max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8">
              <Sparkles className="w-4 h-4" />
              <span>{tx.hero_badge}</span>
            </div>

            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
              {tx.hero_title_1}{' '}
              <span className="gradient-text">{tx.hero_title_2}</span>
            </h1>

            <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
              {tx.hero_desc}
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/register">
                <Button size="xl" variant="gradient" className="gap-2">
                  {tx.hero_cta}
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
              <Button size="xl" variant="outline" className="gap-2">
                <Play className="w-5 h-5" />
                {tx.hero_demo}
              </Button>
            </div>
          </motion.div>

          {/* Hero Visual */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="mt-16 relative"
          >
            <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent z-10 h-32 bottom-0 top-auto" />
            <div className="rounded-2xl border bg-card shadow-2xl overflow-hidden">
              <div className="bg-muted/50 px-4 py-3 flex items-center gap-2 border-b">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                </div>
                <span className="text-sm text-muted-foreground ml-2">{tx.preview_title}</span>
              </div>
              <div className="p-8 bg-gradient-to-br from-muted/30 to-muted/10 min-h-[400px] flex items-center justify-center">
                <div className="w-full max-w-2xl space-y-3">
                  {[
                    { name: tx.preview_agent_1, status: tx.preview_active, done: true, icon: Brain },
                    { name: tx.preview_agent_2, status: tx.preview_active, done: true, icon: Sparkles },
                    { name: tx.preview_agent_3, status: tx.preview_working, done: false, icon: Zap },
                  ].map((step, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 + i * 0.15 }}
                      className="bg-card rounded-xl p-4 border shadow-sm flex items-center gap-4"
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        step.done ? 'bg-green-100 text-green-600' : 'bg-indigo-100 text-indigo-600'
                      }`}>
                        {step.done ? <Check className="w-5 h-5" /> : <step.icon className="w-5 h-5 animate-pulse" />}
                      </div>
                      <div className="flex-1 text-left">
                        <h3 className="font-semibold text-sm">{i + 1}. {step.name}</h3>
                        <p className="text-xs text-muted-foreground">{step.status}</p>
                      </div>
                      {!step.done && (
                        <div className="w-5 h-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                      )}
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-6 bg-muted/30">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {tx.features_title}
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              {tx.features_desc}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              { icon: Brain, title: tx.feat_agents_title, description: tx.feat_agents_desc },
              { icon: Eye, title: tx.feat_commands_title, description: tx.feat_commands_desc },
              { icon: ShieldCheck, title: tx.feat_analytics_title, description: tx.feat_analytics_desc },
              { icon: Server, title: tx.feat_budget_title, description: tx.feat_budget_desc },
              { icon: Rocket, title: tx.feat_improve_title, description: tx.feat_improve_desc },
              { icon: Zap, title: tx.feat_setup_title, description: tx.feat_setup_desc },
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                viewport={{ once: true }}
                className="bg-card rounded-2xl p-6 border hover:shadow-lg transition-shadow"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison — Why not just use generic AI? (post Managed Agents launch) */}
      <section id="compare" className="py-20 px-6">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {tx.compare_title}
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              {tx.compare_desc}
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="grid grid-cols-[1.5fr_1fr_1fr] text-sm">
              {/* Header */}
              <div className="px-5 py-4 bg-muted/50 font-semibold"></div>
              <div className="px-5 py-4 bg-muted/50 font-semibold text-center text-muted-foreground border-l">
                {tx.compare_col_generic}
              </div>
              <div className="px-5 py-4 bg-primary/10 font-semibold text-center text-primary border-l">
                {tx.compare_col_us}
              </div>

              {/* Rows */}
              {[
                { label: tx.compare_row1, generic: tx.compare_row1_generic, us: tx.compare_row1_us },
                { label: tx.compare_row2, generic: tx.compare_row2_generic, us: tx.compare_row2_us },
                { label: tx.compare_row3, generic: tx.compare_row3_generic, us: tx.compare_row3_us },
                { label: tx.compare_row4, generic: tx.compare_row4_generic, us: tx.compare_row4_us },
                { label: tx.compare_row5, generic: tx.compare_row5_generic, us: tx.compare_row5_us },
                { label: tx.compare_row6, generic: tx.compare_row6_generic, us: tx.compare_row6_us },
                { label: tx.compare_row7, generic: tx.compare_row7_generic, us: tx.compare_row7_us },
              ].map((row, i) => (
                <div key={i} className="contents">
                  <div className="px-5 py-4 border-t font-medium">
                    {row.label}
                  </div>
                  <div className="px-5 py-4 border-t border-l text-muted-foreground flex items-start gap-2">
                    <X className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <span>{row.generic}</span>
                  </div>
                  <div className="px-5 py-4 border-t border-l bg-primary/[0.02] flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    <span className="font-medium">{row.us}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-center text-sm text-muted-foreground mt-6 max-w-2xl mx-auto">
            Claude and ChatGPT are incredible models. We use them too — and we let you bring your own key.
            The difference is everything we&apos;ve built <em>around</em> the model.
          </p>
        </div>
      </section>

      {/* Credits Explainer Section */}
      <section id="credits" className="py-20 px-6 bg-gradient-to-b from-background via-primary/5 to-background">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
              <Gem className="w-4 h-4" />
              <span>Credits</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {tx.credits_section_title}
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              {tx.credits_section_subtitle}
            </p>
          </div>

          {/* Quality tier cards */}
          <div className="grid sm:grid-cols-3 gap-4 mb-12 max-w-3xl mx-auto">
            {[
              {
                icon: ZapIcon,
                title: tx.credits_tier_fast,
                desc: tx.credits_tier_fast_desc,
                cost: `~1 ${tx.credits_label_credit}`,
                color: 'text-blue-500',
                bg: 'bg-blue-500/10',
              },
              {
                icon: StarIcon,
                title: tx.credits_tier_balanced,
                desc: tx.credits_tier_balanced_desc,
                cost: `~3 ${tx.credits_label_credits}`,
                color: 'text-amber-500',
                bg: 'bg-amber-500/10',
              },
              {
                icon: Gem,
                title: tx.credits_tier_premium,
                desc: tx.credits_tier_premium_desc,
                cost: `~10 ${tx.credits_label_credits}`,
                color: 'text-purple-500',
                bg: 'bg-purple-500/10',
              },
            ].map((tier, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                viewport={{ once: true }}
                className="bg-card rounded-2xl p-6 border text-center hover:shadow-lg transition-shadow"
              >
                <div className={`w-12 h-12 rounded-xl ${tier.bg} flex items-center justify-center mb-4 mx-auto`}>
                  <tier.icon className={`w-6 h-6 ${tier.color}`} />
                </div>
                <h3 className="text-lg font-semibold mb-1">{tier.title}</h3>
                <div className="text-2xl font-bold gradient-text mb-2">{tier.cost}</div>
                <p className="text-sm text-muted-foreground">{tier.desc}</p>
              </motion.div>
            ))}
          </div>

          {/* Examples table */}
          <div className="bg-card rounded-2xl border overflow-hidden max-w-2xl mx-auto mb-8">
            <div className="px-6 py-4 bg-muted/40 border-b">
              <h3 className="font-semibold">{tx.credits_examples_title}</h3>
            </div>
            <div className="divide-y">
              {[
                { label: tx.credits_example_banner, cost: `3 ${tx.credits_label_credits}` },
                { label: tx.credits_example_social, cost: `2 ${tx.credits_label_credits}` },
                { label: tx.credits_example_seo, cost: `8 ${tx.credits_label_credits}` },
                { label: tx.credits_example_campaign, cost: `50 ${tx.credits_label_credits}` },
                { label: tx.credits_example_dashboard, cost: tx.credits_label_free },
                { label: tx.credits_example_export, cost: tx.credits_label_free },
              ].map((row, i) => (
                <div key={i} className="px-6 py-3 flex items-center justify-between text-sm">
                  <span className="font-medium">{row.label}</span>
                  <span className={`font-mono ${row.cost === tx.credits_label_free ? 'text-green-600' : 'text-primary'}`}>
                    {row.cost}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-center text-sm text-muted-foreground max-w-2xl mx-auto mb-8">
            {tx.credits_section_footnote}
          </p>

          <div className="text-center">
            <Link href="/pricing">
              <Button size="lg" variant="gradient" className="gap-2">
                {tx.credits_section_cta}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Security & Trust Section */}
      <section id="security" className="py-20 px-6 bg-muted/30">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 text-green-600 text-sm font-medium mb-4">
              <ShieldCheck className="w-4 h-4" />
              <span>Enterprise Security</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {tx.security_title}
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              {tx.security_desc}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              { icon: Lock, title: tx.sec_hash_title, description: tx.sec_hash_desc, color: 'text-blue-500', bg: 'bg-blue-500/10' },
              { icon: Database, title: tx.sec_private_title, description: tx.sec_private_desc, color: 'text-purple-500', bg: 'bg-purple-500/10' },
              { icon: FileSearch, title: tx.sec_audit_title, description: tx.sec_audit_desc, color: 'text-amber-500', bg: 'bg-amber-500/10' },
              { icon: ShieldCheck, title: tx.sec_zero_title, description: tx.sec_zero_desc, color: 'text-green-500', bg: 'bg-green-500/10' },
              { icon: Scale, title: tx.sec_gdpr_title, description: tx.sec_gdpr_desc, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
              { icon: Wallet, title: tx.sec_budget_title, description: tx.sec_budget_desc, color: 'text-red-500', bg: 'bg-red-500/10' },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                viewport={{ once: true }}
                className="bg-card rounded-2xl p-6 border hover:shadow-lg transition-shadow"
              >
                <div className={`w-12 h-12 rounded-xl ${item.bg} flex items-center justify-center mb-4`}>
                  <item.icon className={`w-6 h-6 ${item.color}`} />
                </div>
                <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
                <p className="text-muted-foreground text-sm">{item.description}</p>
              </motion.div>
            ))}
          </div>

          {/* Trust badges */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-8 text-muted-foreground">
            <div className="flex items-center gap-2 text-sm">
              <Lock className="w-4 h-4 text-green-500" />
              <span>bcrypt-12 Password Hashing</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Database className="w-4 h-4 text-blue-500" />
              <span>Isolated Database per Tenant</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <ShieldCheck className="w-4 h-4 text-purple-500" />
              <span>JWT + Refresh Token Auth</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <FileSearch className="w-4 h-4 text-amber-500" />
              <span>Complete Audit Logging</span>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            {tx.cta_title}
          </h2>
          <p className="text-muted-foreground text-lg mb-8">
            {tx.cta_desc}
          </p>
          <Link href="/register">
            <Button size="xl" variant="gradient" className="gap-2">
              {tx.cta_button}
              <ArrowRight className="w-5 h-5" />
            </Button>
          </Link>
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
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link href="/blog" className="hover:text-foreground transition">{tx.footer_blog}</Link>
              <a href="https://bap-software.net/contact/" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition">Contact</a>
            </div>
            <p className="text-muted-foreground text-sm">
              1Person. AI Company OS is developed by{' '}
              <a href="https://bap.jp" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">BAP</a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
