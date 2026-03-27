'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Users, ArrowRight, MessageSquare, Loader2, Send, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { FTUXAgent } from '@/lib/ftux/types';
import { useAuthStore } from '@/stores/auth-store';

interface OrgChartViewProps {
  agents: FTUXAgent[];
  companyName: string;
  onContinue: () => void;
  onAgentsUpdated?: (agents: FTUXAgent[]) => void;
}

function AgentNode({ agent, delay }: { agent: FTUXAgent; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, type: 'spring', stiffness: 300, damping: 25 }}
      className="relative group"
    >
      <div
        className="p-4 rounded-xl border-2 bg-card hover:shadow-lg transition-all cursor-default"
        style={{ borderColor: agent.color + '40' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-xl"
            style={{ backgroundColor: agent.color + '20' }}
          >
            {agent.emoji}
          </div>
          <div>
            <p className="font-semibold text-sm">{agent.name}</p>
            <p className="text-xs text-muted-foreground">{agent.title}</p>
          </div>
        </div>

        {/* Tooltip */}
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
          <div className="bg-popover border rounded-lg shadow-lg p-3 min-w-[200px]">
            <p className="text-xs font-medium mb-2">Responsibilities:</p>
            <ul className="text-xs text-muted-foreground space-y-1">
              {(agent.responsibilities || []).map((r, i) => (
                <li key={i} className="flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-primary" /> {r}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function OrgChartView({ agents, companyName, onContinue, onAgentsUpdated }: OrgChartViewProps) {
  const [currentAgents, setCurrentAgents] = useState(agents);
  const [editInput, setEditInput] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const token = useAuthStore((state) => state.token);

  const ceo = currentAgents.find((a) => a.role === 'ceo');
  const managers = currentAgents.filter((a) => a.supervisorId === ceo?.id);
  const workers = currentAgents.filter((a) => managers.some((m) => m.id === a.supervisorId));

  const handleCustomize = useCallback(async () => {
    if (!editInput.trim() || isUpdating) return;
    setIsUpdating(true);

    try {
      // Use LLM to interpret user request and modify team
      const currentTeam = currentAgents.map((a) => `${a.name} - ${a.title} (${a.role})`).join('\n');

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1'}/ftux/customize-team`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          currentTeam: currentAgents,
          request: editInput,
          companyName,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.agents && data.agents.length > 0) {
          setCurrentAgents(data.agents);
          onAgentsUpdated?.(data.agents);
        }
      }

      setEditInput('');
    } catch {
      // Fallback: add a generic agent based on description
      const colors = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#06b6d4', '#ef4444', '#ec4899'];
      const newAgent: FTUXAgent = {
        id: `agent_${Date.now()}`,
        name: 'New Agent',
        role: 'custom',
        title: editInput.substring(0, 50),
        emoji: '🤖',
        color: colors[currentAgents.length % colors.length],
        supervisorId: ceo?.id,
        responsibilities: [editInput],
      };
      const updated = [...currentAgents, newAgent];
      setCurrentAgents(updated);
      onAgentsUpdated?.(updated);
      setEditInput('');
    } finally {
      setIsUpdating(false);
    }
  }, [editInput, isUpdating, currentAgents, token, companyName, ceo, onAgentsUpdated]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-3xl"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: 'spring' }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-500 mb-4"
          >
            <Users className="w-8 h-8 text-white" />
          </motion.div>
          <h1 className="text-2xl font-bold mb-2">Your AI Team is Ready!</h1>
          <p className="text-muted-foreground">
            {currentAgents.length} AI agents for <span className="text-foreground font-medium">{companyName}</span>
          </p>
        </div>

        {/* Org Chart */}
        <Card className="border-0 shadow-xl mb-4">
          <CardContent className="p-8">
            {ceo && (
              <div className="flex justify-center mb-6">
                <AgentNode agent={ceo} delay={0.2} />
              </div>
            )}

            {managers.length > 0 && (
              <>
                <div className="flex justify-center mb-2">
                  <div className="w-0.5 h-6 bg-border" />
                </div>
                {managers.length > 1 && (
                  <div className="flex justify-center mb-2">
                    <div className="h-0.5 bg-border" style={{ width: `${Math.min(managers.length * 180, 400)}px` }} />
                  </div>
                )}
                <div className="flex justify-center gap-4 mb-6">
                  {managers.map((agent, i) => (
                    <div key={agent.id} className="flex flex-col items-center">
                      <div className="w-0.5 h-4 bg-border mb-2" />
                      <AgentNode agent={agent} delay={0.4 + i * 0.1} />
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Workers grouped by their manager */}
            {managers.map((manager) => {
              const managerWorkers = currentAgents.filter((a) => a.supervisorId === manager.id);
              if (managerWorkers.length === 0) return null;
              return (
                <div key={`group-${manager.id}`} className="mt-4">
                  <div className="flex justify-center mb-1">
                    <p className="text-[10px] text-muted-foreground">Reports to {manager.name}</p>
                  </div>
                  <div className="flex justify-center mb-2">
                    <div className="w-0.5 h-3 bg-border" />
                  </div>
                  <div className="flex justify-center gap-3 flex-wrap">
                    {managerWorkers.map((agent, i) => (
                      <AgentNode key={agent.id} agent={agent} delay={0.7 + i * 0.1} />
                    ))}
                  </div>
                </div>
              );
            })}
            {/* Workers without a manager (report directly to CEO) */}
            {(() => {
              const orphanWorkers = currentAgents.filter((a) =>
                a.role !== 'ceo' &&
                !managers.some((m) => m.id === a.id) &&
                !managers.some((m) => m.id === a.supervisorId)
              );
              if (orphanWorkers.length === 0) return null;
              return (
                <div className="mt-4">
                  <div className="flex justify-center mb-1">
                    <p className="text-[10px] text-muted-foreground">Reports to CEO</p>
                  </div>
                  <div className="flex justify-center mb-2">
                    <div className="w-0.5 h-3 bg-border" />
                  </div>
                  <div className="flex justify-center gap-3 flex-wrap">
                    {orphanWorkers.map((agent, i) => (
                      <AgentNode key={agent.id} agent={agent} delay={0.7 + i * 0.1} />
                    ))}
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* Customize Team */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1 }}
          className="mb-6"
        >
          {!showEditor ? (
            <button
              onClick={() => setShowEditor(true)}
              className="w-full text-center py-3 text-sm text-muted-foreground hover:text-primary transition-colors flex items-center justify-center gap-2"
            >
              <MessageSquare className="w-4 h-4" />
              Want to change the team? Tell us what you need
            </button>
          ) : (
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-primary" />
                  Describe what you'd like to change
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  E.g. "Add a customer support agent under Carol Lee" or "I need a content writer in the marketing team" or "Remove Eva Garcia"
                </p>
                <form onSubmit={(e) => { e.preventDefault(); handleCustomize(); }} className="flex gap-2">
                  <Input
                    value={editInput}
                    onChange={(e) => setEditInput(e.target.value)}
                    placeholder="I need a customer support person..."
                    disabled={isUpdating}
                    className="flex-1"
                  />
                  <Button type="submit" size="icon" disabled={!editInput.trim() || isUpdating}>
                    {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </motion.div>

        {/* Continue */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2 }}
          className="flex justify-center"
        >
          <Button
            onClick={onContinue}
            size="lg"
            className="gap-2 bg-gradient-to-r from-primary to-purple-500"
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
}
