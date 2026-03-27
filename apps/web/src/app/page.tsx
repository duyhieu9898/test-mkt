'use client';

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
} from 'lucide-react';

export default function LandingPage() {
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
              Features
            </Link>
            <Link href="#how-it-works" className="text-muted-foreground hover:text-foreground transition">
              How it Works
            </Link>
            <Link href="#pricing" className="text-muted-foreground hover:text-foreground transition">
              Pricing
            </Link>
          </div>

          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost">Sign In</Button>
            </Link>
            <Link href="/register">
              <Button variant="gradient">Get Started</Button>
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
              <span>The Future of Business Automation</span>
            </div>

            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
              Run Your Company with{' '}
              <span className="gradient-text">AI Agents</span>
            </h1>

            <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
              Launch and operate an entire business with just yourself. AI agents handle marketing,
              sales, content, and operations while you focus on strategy.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/register">
                <Button size="xl" variant="gradient" className="gap-2">
                  Start Free Trial
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
              <Button size="xl" variant="outline" className="gap-2">
                <Play className="w-5 h-5" />
                Watch Demo
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
                <span className="text-sm text-muted-foreground ml-2">AI Company OS Dashboard</span>
              </div>
              <div className="p-8 bg-gradient-to-br from-muted/30 to-muted/10 min-h-[400px] flex items-center justify-center">
                <div className="grid grid-cols-3 gap-6 w-full max-w-3xl">
                  {/* Agent Cards Preview */}
                  {[
                    { name: 'CEO Agent', status: 'Active', icon: '👔', color: 'purple' },
                    { name: 'Marketing Manager', status: 'Active', icon: '📈', color: 'blue' },
                    { name: 'Content Creator', status: 'Working', icon: '✍️', color: 'green' },
                  ].map((agent, i) => (
                    <motion.div
                      key={agent.name}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.5 + i * 0.1 }}
                      className="bg-card rounded-xl p-4 border shadow-sm"
                    >
                      <div className="text-3xl mb-3">{agent.icon}</div>
                      <h3 className="font-semibold">{agent.name}</h3>
                      <div className="flex items-center gap-2 mt-2">
                        <div className={`w-2 h-2 rounded-full bg-green-500 animate-pulse`} />
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
              Everything You Need to Run a Company
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              AI agents work together as a team, executing real tasks and delivering results.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: Bot,
                title: 'AI Agent Teams',
                description:
                  'CEO, Marketing, Sales, Content agents that communicate and coordinate automatically.',
              },
              {
                icon: Zap,
                title: 'Natural Commands',
                description:
                  'Just tell the system what you want in plain English or voice. No technical skills needed.',
              },
              {
                icon: LineChart,
                title: 'Real-time Analytics',
                description:
                  'Track KPIs, budgets, and performance across all agents in a unified dashboard.',
              },
              {
                icon: Shield,
                title: 'Budget Control',
                description:
                  'Set spending limits and approval workflows. Stay in control while agents execute.',
              },
              {
                icon: Sparkles,
                title: 'Self-Improving',
                description:
                  'Agents learn and improve over time based on results and feedback.',
              },
              {
                icon: Play,
                title: 'Instant Setup',
                description:
                  'Describe your business idea and get a full AI company structure in minutes.',
              },
            ].map((feature, i) => (
              <motion.div
                key={feature.title}
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

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Ready to Launch Your AI Company?
          </h2>
          <p className="text-muted-foreground text-lg mb-8">
            Join thousands of founders running businesses with AI. Start free, scale as you grow.
          </p>
          <Link href="/register">
            <Button size="xl" variant="gradient" className="gap-2">
              Get Started Free
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
            <p className="text-muted-foreground text-sm">
              2025 1Person. AI Company OS.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
