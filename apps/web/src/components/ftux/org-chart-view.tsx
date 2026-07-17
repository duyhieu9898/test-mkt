'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Users, ArrowRight, MessageSquare, Loader2, Send, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { FTUXAgent } from '@/lib/ftux/types';
import { useAuthStore } from '@/stores/auth-store';
import { AiTeamOrgChart } from '@/components/ai-team/ai-team-org-chart';
import { toast } from 'sonner';

interface OrgChartViewProps {
  agents: FTUXAgent[];
  companyId: string;
  companyName: string;
  onContinue: () => void;
  onAgentsUpdated?: (agents: FTUXAgent[]) => void;
}

export function OrgChartView({ agents, companyId, companyName, onContinue, onAgentsUpdated }: OrgChartViewProps) {
  const [currentAgents, setCurrentAgents] = useState(agents);
  const [editInput, setEditInput] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const token = useAuthStore((state) => state.token);

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
          companyId,
          currentTeam: currentAgents,
          request: editInput,
          companyName,
        }),
      });

      if (!res.ok) {
        throw new Error('Your team could not be updated');
      }
      const data = await res.json();
      if (data.agents && data.agents.length > 0) {
        setCurrentAgents(data.agents);
        onAgentsUpdated?.(data.agents);
        toast.success('Your AI team has been updated');
      }

      setEditInput('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Your team could not be updated');
    } finally {
      setIsUpdating(false);
    }
  }, [editInput, isUpdating, currentAgents, token, companyId, companyName, onAgentsUpdated]);

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
            <AiTeamOrgChart agents={currentAgents} />
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
