'use client';

import { motion } from 'framer-motion';
import { Calendar, Rocket, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { FTUXStrategy } from '@/lib/ftux/types';

interface StrategyViewProps {
  strategy: FTUXStrategy;
  companyName: string;
  onApprove: () => void;
  onModify?: () => void;
}

export function StrategyView({
  strategy,
  companyName,
  onApprove,
  onModify,
}: StrategyViewProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-2xl"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: 'spring' }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 mb-4"
          >
            <Calendar className="w-8 h-8 text-white" />
          </motion.div>
          <h1 className="text-2xl font-bold mb-2">Your 7-Day Launch Plan</h1>
          <p className="text-muted-foreground">
            AI-generated strategy for <span className="text-foreground font-medium">{companyName}</span>
          </p>
        </div>

        {/* Vision */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-6"
        >
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Rocket className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-primary mb-1">Vision</p>
                  <p className="text-sm">{strategy.vision}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Timeline */}
        <Card className="border-0 shadow-xl mb-6">
          <CardContent className="p-6">
            <div className="relative">
              {/* Vertical Line */}
              <div className="absolute left-[23px] top-4 bottom-4 w-0.5 bg-border" />

              {/* Days */}
              <div className="space-y-6">
                {strategy.days.map((day, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + index * 0.1 }}
                    className="relative flex gap-4"
                  >
                    {/* Day indicator */}
                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white font-bold text-sm z-10">
                      {typeof day.day === 'number' ? `D${day.day}` : day.day}
                    </div>

                    {/* Content */}
                    <div className="flex-1 pb-2">
                      <h3 className="font-semibold mb-2">{day.title}</h3>
                      <ul className="space-y-1.5">
                        {day.activities.map((activity, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                            <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                            {activity}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="flex items-center justify-center gap-3"
        >
          {onModify && (
            <Button variant="outline" onClick={onModify}>
              Modify Strategy
            </Button>
          )}
          <Button
            onClick={onApprove}
            size="lg"
            className="gap-2 px-8 bg-gradient-to-r from-primary to-purple-500"
          >
            <CheckCircle2 className="w-5 h-5" />
            Approve Strategy
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
}
