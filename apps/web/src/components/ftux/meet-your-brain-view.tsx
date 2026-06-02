'use client';

import { motion } from 'framer-motion';
import { Sparkles, MessageCircle, Users, Package, ArrowRight, ExternalLink } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';

interface BrandVoice {
  tone?: string | null;
  description?: string | null;
}
interface Persona {
  name: string;
  description?: string | null;
  attributes?: { painPoints?: string[] } | null;
  isPrimary?: boolean;
}
interface Product {
  id: string;
  name: string;
  description?: string | null;
}
interface BrainSnapshot {
  brandVoice: BrandVoice | null;
  personas: Persona[];
  primaryPersona: Persona | null;
  products: Product[];
}

interface MeetYourBrainViewProps {
  companyId: string;
  onContinue: () => void;
}

const POLL_MS = 2000;
const MAX_POLLS = 15; // ~30s

export function MeetYourBrainView({ companyId, onContinue }: MeetYourBrainViewProps) {
  const token = useAuthStore((s) => s.token);

  const { data, isLoading, dataUpdatedAt, errorUpdatedAt } = useQuery<BrainSnapshot>({
    queryKey: ['brain-snapshot', companyId],
    queryFn: () => api.get<BrainSnapshot>(`/brain/${companyId}`, { token: token! }),
    enabled: !!token && !!companyId,
    refetchInterval: (query) => {
      const d = query.state.data as BrainSnapshot | undefined;
      if (d?.brandVoice) return false;
      if (query.state.dataUpdateCount >= MAX_POLLS) return false;
      return POLL_MS;
    },
    refetchIntervalInBackground: false,
    retry: false,
  });

  const hasContent = !!data?.brandVoice;
  const stillPolling = !hasContent && (isLoading || (!dataUpdatedAt && !errorUpdatedAt));
  const timedOut = !hasContent && !stillPolling;

  const primary = data?.primaryPersona ?? data?.personas?.[0] ?? null;
  const products = (data?.products ?? []).slice(0, 3);
  const painPoints = primary?.attributes?.painPoints ?? [];

  return (
    <div className="flex flex-col items-center justify-start min-h-screen p-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-2xl"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 mb-4">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold mb-2">Meet your Brain</h2>
          <p className="text-muted-foreground">
            This is what your AI learned about your business — review and edit before we get started
          </p>
        </div>

        <Card className="mb-6 border-indigo-100 dark:border-indigo-900/40 shadow-md">
          <CardContent className="p-6 space-y-6">
            {stillPolling && <BrainSkeleton />}

            {timedOut && (
              <div className="text-center py-8">
                <p className="text-muted-foreground">
                  We couldn&apos;t read your website automatically — you can fill in Brain details later.
                </p>
              </div>
            )}

            {hasContent && (
              <>
                <Section icon={<MessageCircle className="w-4 h-4" />} title="Brand voice">
                  {data?.brandVoice?.tone && (
                    <Badge className="mb-2 bg-indigo-100 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/40 dark:text-indigo-200">
                      {data.brandVoice.tone}
                    </Badge>
                  )}
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {data?.brandVoice?.description || 'No description yet.'}
                  </p>
                </Section>

                <Section icon={<Users className="w-4 h-4" />} title="Customer">
                  {primary ? (
                    <>
                      <p className="font-medium text-sm">{primary.name}</p>
                      {primary.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{primary.description}</p>
                      )}
                      {painPoints.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {painPoints.slice(0, 5).map((p) => (
                            <span key={p} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                              {p}
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No persona detected yet.</p>
                  )}
                </Section>

                <Section icon={<Package className="w-4 h-4" />} title="Products">
                  {products.length > 0 ? (
                    <ul className="space-y-2">
                      {products.map((p) => (
                        <li key={p.id} className="text-sm">
                          <span className="font-medium">{p.name}</span>
                          {p.description && (
                            <span className="text-muted-foreground"> — {p.description}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No products detected yet.</p>
                  )}
                </Section>
              </>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse sm:flex-row gap-3 justify-between items-center">
          <Button
            variant="ghost"
            onClick={() => window.open(`/${companyId}/brain`, '_blank')}
            className="gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            Edit Brain first
          </Button>
          <Button
            size="lg"
            onClick={onContinue}
            className="gap-2 px-10 py-6 text-lg bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 shadow-xl"
          >
            Start
            <ArrowRight className="w-5 h-5" />
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2 text-indigo-600 dark:text-indigo-300">
        {icon}
        <h3 className="font-semibold text-sm uppercase tracking-wide">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function BrainSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {[0, 1, 2].map((i) => (
        <div key={i}>
          <div className="h-4 w-24 bg-muted rounded mb-2" />
          <div className="h-3 w-full bg-muted rounded mb-1" />
          <div className="h-3 w-2/3 bg-muted rounded" />
        </div>
      ))}
      <p className="text-xs text-center text-muted-foreground">Reading your website…</p>
    </div>
  );
}
