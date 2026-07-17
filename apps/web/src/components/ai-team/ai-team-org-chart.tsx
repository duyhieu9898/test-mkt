'use client';

import { motion } from 'framer-motion';
import { Bot, CheckCircle2 } from 'lucide-react';

export interface AiTeamMember {
  id: string;
  name: string;
  role: string;
  title: string;
  color: string;
  emoji?: string;
  supervisorId?: string;
  responsibilities: string[];
}

interface AiTeamOrgChartProps {
  agents: AiTeamMember[];
  animated?: boolean;
}

function AgentNode({
  agent,
  delay,
  animated,
}: {
  agent: AiTeamMember;
  delay: number;
  animated: boolean;
}) {
  return (
    <motion.div
      initial={animated ? { opacity: 0, scale: 0.9 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, type: 'spring', stiffness: 300, damping: 25 }}
      className="group relative min-w-0"
      tabIndex={agent.responsibilities.length > 0 ? 0 : undefined}
    >
      <div
        className="min-h-[74px] w-full min-w-[190px] border-2 bg-white p-3 transition-shadow hover:shadow-md sm:w-auto"
        style={{ borderColor: `${agent.color}40` }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg"
            style={{ backgroundColor: `${agent.color}20`, color: agent.color }}
          >
            {agent.emoji || <Bot className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{agent.name}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{agent.title}</p>
          </div>
        </div>

        {agent.responsibilities.length > 0 && (
          <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-64 -translate-x-1/2 border bg-white p-3 shadow-lg group-hover:block group-focus-within:block">
            <p className="mb-2 text-xs font-medium text-slate-800">Responsibilities</p>
            <ul className="space-y-1.5">
              {agent.responsibilities.slice(0, 6).map((responsibility) => (
                <li key={responsibility} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                  <span>{responsibility}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function AiTeamOrgChart({ agents, animated = true }: AiTeamOrgChartProps) {
  const ceo = agents.find((agent) => agent.role === 'ceo');
  const managers = agents.filter((agent) => agent.supervisorId === ceo?.id);
  const managedWorkerIds = new Set(
    managers.flatMap((manager) =>
      agents
        .filter((agent) => agent.supervisorId === manager.id)
        .map((agent) => agent.id),
    ),
  );
  const directReports = agents.filter((agent) =>
    agent.role !== 'ceo'
    && !managers.some((manager) => manager.id === agent.id)
    && !managedWorkerIds.has(agent.id),
  );

  if (agents.length === 0) {
    return (
      <div className="py-10 text-center">
        <Bot className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-2 text-sm font-medium text-slate-700">No AI agents yet</p>
        <p className="mt-1 text-xs text-muted-foreground">Your team will appear here after setup.</p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-visible pb-3">
      <div className="mx-auto min-w-[280px] max-w-4xl px-1">
        {ceo && (
          <div className="flex justify-center">
            <AgentNode agent={ceo} delay={0.05} animated={animated} />
          </div>
        )}

        {managers.length > 0 && (
          <>
            <div className="mx-auto h-7 w-px bg-slate-200" />
            <div className="mx-auto mb-3 h-px max-w-xl bg-slate-200" />
            <div className="flex flex-wrap justify-center gap-4">
              {managers.map((manager, index) => (
                <div key={manager.id} className="flex min-w-[190px] flex-col items-center">
                  <div className="mb-2 h-4 w-px bg-slate-200" />
                  <AgentNode
                    agent={manager}
                    delay={0.15 + index * 0.06}
                    animated={animated}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {managers.map((manager, managerIndex) => {
          const workers = agents.filter((agent) => agent.supervisorId === manager.id);
          if (workers.length === 0) return null;
          return (
            <div key={`team-${manager.id}`} className="mt-6">
              <p className="mb-2 text-center text-[11px] text-muted-foreground">
                Reports to {manager.name}
              </p>
              <div className="mx-auto h-4 w-px bg-slate-200" />
              <div className="flex flex-wrap justify-center gap-3">
                {workers.map((worker, index) => (
                  <AgentNode
                    key={worker.id}
                    agent={worker}
                    delay={0.3 + managerIndex * 0.08 + index * 0.05}
                    animated={animated}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {directReports.length > 0 && (
          <div className="mt-6">
            <p className="mb-2 text-center text-[11px] text-muted-foreground">
              Reports directly to CEO
            </p>
            <div className="mx-auto h-4 w-px bg-slate-200" />
            <div className="flex flex-wrap justify-center gap-3">
              {directReports.map((agent, index) => (
                <AgentNode
                  key={agent.id}
                  agent={agent}
                  delay={0.35 + index * 0.05}
                  animated={animated}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
