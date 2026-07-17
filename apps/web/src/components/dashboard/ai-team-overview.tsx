'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ExternalLink, Loader2, Users } from 'lucide-react';
import { AiTeamOrgChart, type AiTeamMember } from '@/components/ai-team/ai-team-org-chart';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useTeam, type EmployeeCard } from '@/lib/api/team-hooks';
import { cn } from '@/lib/utils';

function toTeamMember(agent: EmployeeCard): AiTeamMember {
  return {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    title: agent.roleTitle,
    color: agent.accentColor || '#6366f1',
    emoji: agent.avatarEmoji,
    supervisorId: agent.supervisorId,
    responsibilities: agent.responsibilities,
  };
}

export function AiTeamOverview({ companyId }: { companyId: string }) {
  const [expanded, setExpanded] = useState(false);
  const agentsQuery = useTeam(companyId);
  const team = useMemo(
    () => (agentsQuery.data?.employees ?? []).map(toTeamMember),
    [agentsQuery.data],
  );
  const activeCount = (agentsQuery.data?.employees ?? []).filter((agent) =>
    ['ready', 'running'].includes(agent.status),
  ).length;

  return (
    <Card className="overflow-visible border-slate-200">
      <CardContent className="p-0">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-indigo-50 text-indigo-600">
              <Users className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-slate-900">Your AI Team</h2>
              <p className="text-sm text-slate-500">
                {agentsQuery.isLoading
                  ? 'Loading your team...'
                  : agentsQuery.isError
                    ? 'Your team is temporarily unavailable'
                    : `${team.length} agents / ${activeCount} ready to work`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href={`/${companyId}/team`}>
                Team workspace
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setExpanded((current) => !current)}
              className="gap-1.5"
              aria-expanded={expanded}
              aria-controls="dashboard-ai-team-chart"
              disabled={agentsQuery.isLoading}
            >
              {expanded ? 'Hide team' : 'View team'}
              {agentsQuery.isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
              )}
            </Button>
          </div>
        </div>

        {expanded && (
          <div id="dashboard-ai-team-chart" className="border-t bg-slate-50/40 px-4 py-6">
            {agentsQuery.isError ? (
              <div className="py-8 text-center">
                <p className="text-sm font-medium text-slate-700">Your AI team could not be loaded</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => agentsQuery.refetch()}
                >
                  Try again
                </Button>
              </div>
            ) : (
              <AiTeamOrgChart agents={team} />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
