'use client';

import { motion } from 'framer-motion';
import { EXAMPLE_IDEAS } from '@/lib/ftux/mock-data';

interface ExampleIdeasProps {
  onSelect: (idea: string) => void;
}

export function ExampleIdeas({ onSelect }: ExampleIdeasProps) {
  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {EXAMPLE_IDEAS.map((idea, index) => (
        <motion.button
          key={idea}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 + index * 0.1, duration: 0.3 }}
          onClick={() => onSelect(idea)}
          className="px-4 py-2 rounded-full bg-muted/50 hover:bg-muted text-sm text-muted-foreground hover:text-foreground transition-all border border-transparent hover:border-primary/20"
        >
          {idea}
        </motion.button>
      ))}
    </div>
  );
}
