'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { PartyPopper, Users, DollarSign, ListTodo, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import Confetti from 'react-confetti';
import { useWindowSize } from '@/hooks/use-window-size';

interface CelebrationViewProps {
  companyId: string;
  companyName: string;
  agentCount: number;
  taskCount: number;
  budget: number;
}

export function CelebrationView({
  companyId,
  companyName,
  agentCount,
  taskCount,
  budget,
}: CelebrationViewProps) {
  const router = useRouter();
  const { width, height } = useWindowSize();
  const [countdown, setCountdown] = useState(5);
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    // Auto-redirect countdown
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          router.push(`/${companyId}`);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Stop confetti after 4 seconds
    const confettiTimer = setTimeout(() => {
      setShowConfetti(false);
    }, 4000);

    return () => {
      clearInterval(timer);
      clearTimeout(confettiTimer);
    };
  }, [companyId, router]);

  const handleGoToDashboard = () => {
    router.push(`/${companyId}`);
  };

  const stats = [
    { icon: Users, label: 'Agents Active', value: agentCount, color: 'text-blue-500' },
    { icon: DollarSign, label: 'Monthly Budget', value: `$${budget}`, color: 'text-green-500' },
    { icon: ListTodo, label: 'Tasks Scheduled', value: taskCount, color: 'text-purple-500' },
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 relative overflow-hidden">
      {/* Confetti */}
      {showConfetti && (
        <Confetti
          width={width}
          height={height}
          recycle={false}
          numberOfPieces={500}
          gravity={0.3}
        />
      )}

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, type: 'spring' }}
        className="w-full max-w-lg text-center z-10"
      >
        {/* Icon */}
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-yellow-400 to-orange-500 mb-6"
        >
          <PartyPopper className="w-10 h-10 text-white" />
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-3xl md:text-4xl font-bold mb-3"
        >
          Your AI Company is Live!
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-lg text-muted-foreground mb-8"
        >
          <span className="text-foreground font-semibold">{companyName}</span> is ready to operate
        </motion.p>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="grid grid-cols-3 gap-4 mb-8"
        >
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6 + index * 0.1 }}
            >
              <Card className="border-0 shadow-lg">
                <CardContent className="p-4 text-center">
                  <stat.icon className={`w-6 h-6 mx-auto mb-2 ${stat.color}`} />
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
        >
          <Button
            onClick={handleGoToDashboard}
            size="lg"
            className="gap-2 px-8 py-6 text-lg bg-gradient-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-500/90 shadow-lg"
          >
            Go to CEO Dashboard
            <ArrowRight className="w-5 h-5" />
          </Button>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1 }}
            className="mt-4 text-sm text-muted-foreground"
          >
            Redirecting in {countdown} seconds...
          </motion.p>
        </motion.div>
      </motion.div>
    </div>
  );
}
