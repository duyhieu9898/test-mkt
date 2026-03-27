'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, Mic, MicOff, Sparkles, Loader2 } from 'lucide-react';

interface CommandInputProps {
  onResult?: (result: string) => void;
}

const suggestions = [
  'Create a marketing campaign for millennials',
  "Show me this week's performance",
  'Generate a content calendar',
  'Analyze our top competitors',
];

export function CommandInput({ onResult }: CommandInputProps) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    setIsLoading(true);

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Mock response
    const response = `I understand you want to: "${input}"\n\nI've created a task for your AI agents to work on this. The Marketing Manager will coordinate the effort.\n\nEstimated completion: 30 minutes`;

    onResult?.(response);
    setInput('');
    setIsLoading(false);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
    inputRef.current?.focus();
  };

  const toggleVoice = () => {
    setIsListening(!isListening);
    // Voice recognition would be implemented here
  };

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="relative">
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          placeholder="Ask me anything... (e.g., 'Create a marketing campaign')"
          className="h-14 pl-12 pr-28 text-base bg-background"
          disabled={isLoading}
        />
        <Sparkles className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-primary" />

        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleVoice}
            className={isListening ? 'text-red-500' : 'text-muted-foreground'}
          >
            {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </Button>
          <Button type="submit" size="sm" disabled={!input.trim() || isLoading}>
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>

        {/* AI Thinking Animation */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute -bottom-8 left-0 flex items-center gap-2 text-sm text-muted-foreground"
          >
            <div className="flex gap-1">
              <motion.span
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1, repeat: Infinity, delay: 0 }}
                className="w-2 h-2 rounded-full bg-primary"
              />
              <motion.span
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                className="w-2 h-2 rounded-full bg-primary"
              />
              <motion.span
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                className="w-2 h-2 rounded-full bg-primary"
              />
            </div>
            <span>AI is thinking...</span>
          </motion.div>
        )}
      </form>

      {/* Suggestions */}
      <AnimatePresence>
        {isFocused && !input && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-wrap gap-2"
          >
            {suggestions.map((suggestion, i) => (
              <motion.button
                key={suggestion}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => handleSuggestionClick(suggestion)}
                className="px-3 py-1.5 text-sm bg-muted hover:bg-muted/80 rounded-full transition-colors"
              >
                {suggestion}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
