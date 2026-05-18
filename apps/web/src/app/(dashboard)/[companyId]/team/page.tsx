'use client';

/**
 * Team — Block 3.
 *
 * Grid of the 7 named employees. Each card shows avatar, name, role,
 * intro, current KPI snapshots, and a "Chat" button that opens the
 * employee's DM. A memory-coverage strip below the grid tells the
 * founder which content sources are indexed in semantic memory.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, ArrowRight, Loader2, Brain, Database } from 'lucide-react';
import { useTeam } from '@/lib/api/team-hooks';

const SOURCE_LABEL: Record<string, string> = {
  brand_iq: 'Brand IQ',
  knowledge_base: 'Knowledge base',
  blog_post: 'Blog posts',
  gsc_query: 'Search Console',
  geo_mention: 'GEO mentions',
  meeting: 'Meetings',
  manual: 'Manual notes',
};

export default function TeamPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const { data, isLoading } = useTeam(companyId);

  if (isLoading) {
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3" /> Loading your team…
      </div>
    );
  }

  const employees = data?.employees ?? [];
  const memory = data?.memory ?? { total: 0, bySource: {} };

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-1">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="w-6 h-6 text-primary" /> Your AI team
        </h1>
        <p className="text-muted-foreground text-sm">
          Seven named employees. Each one reads your Brand IQ and your company memory before
          answering. Click <em>Chat</em> to DM any of them.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {employees.map((e) => (
          <Card key={e.slug} className="overflow-hidden hover:shadow-md transition-shadow">
            <div
              className="h-1.5"
              style={{ background: e.accentColor }}
            />
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                  style={{ background: `${e.accentColor}22` }}
                >
                  {e.avatarEmoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-base">{e.name}</div>
                  <Badge variant="secondary" className="text-[10px] mt-0.5">
                    {e.roleTitle}
                  </Badge>
                </div>
              </div>

              <p className="text-xs text-muted-foreground line-clamp-3">{e.intro}</p>

              {e.kpis.length > 0 && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {e.kpis.map((k) => (
                    <div key={k.key} className="bg-muted/40 rounded-md px-2 py-1.5">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">
                        {k.label}
                      </div>
                      <div className="font-semibold text-sm truncate">{k.value || '—'}</div>
                    </div>
                  ))}
                </div>
              )}

              <Link href={`/${companyId}/team/${e.slug}`}>
                <Button size="sm" variant="outline" className="w-full gap-1">
                  Chat with {e.name} <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-4 h-4 text-primary" />
            <div className="font-semibold text-sm">Company memory ({memory.total} chunks indexed)</div>
          </div>
          {memory.total === 0 ? (
            <p className="text-xs text-muted-foreground">
              No memory chunks yet. Generate a Brand IQ profile, add knowledge base entries, or publish
              blog posts to seed your team&apos;s semantic recall.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(memory.bySource)
                .sort((a, b) => b[1] - a[1])
                .map(([src, n]) => (
                  <Badge key={src} variant="outline" className="gap-1 text-xs">
                    <Database className="w-3 h-3" /> {SOURCE_LABEL[src] ?? src}: {n}
                  </Badge>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
