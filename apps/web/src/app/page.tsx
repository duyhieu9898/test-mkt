'use client';

import { useState } from 'react';
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
} from 'lucide-react';
import { type Locale, locales, localeNames, localeFlags, getTranslations } from '@/lib/i18n';

export default function LandingPage() {
  const [locale, setLocale] = useState<Locale>('en');
  const [langOpen, setLangOpen] = useState(false);
  const tx = getTranslations(locale);

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
                      onClick={() => { setLocale(l); setLangOpen(false); }}
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
                <div className="grid grid-cols-3 gap-6 w-full max-w-3xl">
                  {[
                    { name: tx.preview_agent_1, status: tx.preview_active, icon: '👔', color: 'purple' },
                    { name: tx.preview_agent_2, status: tx.preview_active, icon: '📈', color: 'blue' },
                    { name: tx.preview_agent_3, status: tx.preview_working, icon: '✍️', color: 'green' },
                  ].map((agent, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.5 + i * 0.1 }}
                      className="bg-card rounded-xl p-4 border shadow-sm"
                    >
                      <div className="text-3xl mb-3">{agent.icon}</div>
                      <h3 className="font-semibold">{agent.name}</h3>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-sm text-muted-foreground">{agent.status}</span>
                      </div>
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
              { icon: Bot, title: tx.feat_agents_title, description: tx.feat_agents_desc },
              { icon: Zap, title: tx.feat_commands_title, description: tx.feat_commands_desc },
              { icon: LineChart, title: tx.feat_analytics_title, description: tx.feat_analytics_desc },
              { icon: Shield, title: tx.feat_budget_title, description: tx.feat_budget_desc },
              { icon: Sparkles, title: tx.feat_improve_title, description: tx.feat_improve_desc },
              { icon: Play, title: tx.feat_setup_title, description: tx.feat_setup_desc },
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

      {/* Security & Trust Section */}
      <section id="security" className="py-20 px-6">
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
      <section className="py-20 px-6 bg-muted/30">
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
