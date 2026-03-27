'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  X,
  ChevronRight,
  User,
  Edit,
  Play,
  Layout,
  MessageCircle,
  FileText,
  List,
  Code,
  Users,
  Gift,
  Filter,
  UserMinus,
  Activity,
  Zap,
  Layers,
  Award,
  TrendingUp,
  Megaphone,
  Headphones,
  Rocket,
  Share2,
  CheckSquare,
  BarChart,
  DollarSign,
  BookOpen,
} from 'lucide-react';
import type { GuidanceItem as GuidanceItemType } from '@/lib/api/hooks';

interface GuidanceItemProps {
  item: GuidanceItemType;
  onComplete?: (id: string) => void;
  onDismiss?: (id: string) => void;
  isLoading?: boolean;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  user: User,
  edit: Edit,
  play: Play,
  layout: Layout,
  'message-circle': MessageCircle,
  'file-text': FileText,
  list: List,
  code: Code,
  users: Users,
  gift: Gift,
  filter: Filter,
  'user-minus': UserMinus,
  activity: Activity,
  zap: Zap,
  layers: Layers,
  award: Award,
  'trending-up': TrendingUp,
  megaphone: Megaphone,
  headphones: Headphones,
  rocket: Rocket,
  'share-2': Share2,
  'check-square': CheckSquare,
  'bar-chart': BarChart,
  'dollar-sign': DollarSign,
  book: BookOpen,
};

const priorityColors: Record<string, string> = {
  critical: 'border-red-500/50 bg-red-500/5',
  high: 'border-orange-500/50 bg-orange-500/5',
  medium: 'border-blue-500/50 bg-blue-500/5',
  low: 'border-gray-500/50 bg-gray-500/5',
};

const priorityBadgeVariants: Record<string, 'destructive' | 'warning' | 'default' | 'secondary'> = {
  critical: 'destructive',
  high: 'warning',
  medium: 'default',
  low: 'secondary',
};

export function GuidanceItemComponent({ item, onComplete, onDismiss, isLoading }: GuidanceItemProps) {
  const IconComponent = item.icon ? iconMap[item.icon] || CheckCircle2 : CheckCircle2;
  const isCompleted = item.status === 'completed';
  const isDismissed = item.status === 'dismissed';

  if (isCompleted || isDismissed) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -100 }}
      className={`p-4 rounded-lg border ${priorityColors[item.priority] || priorityColors.medium} transition-all hover:shadow-md`}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: item.color ? `${item.color}20` : '#3b82f620' }}
        >
          <IconComponent
            className="w-5 h-5"
            style={{ color: item.color || '#3b82f6' }}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium text-sm line-clamp-1">{item.title}</h4>
            {item.priority === 'critical' && (
              <Badge variant={priorityBadgeVariants[item.priority]} className="text-xs">
                Critical
              </Badge>
            )}
          </div>

          {item.description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
              {item.description}
            </p>
          )}

          <div className="flex items-center gap-2">
            {item.actionLabel && (
              <Button
                size="sm"
                variant="default"
                className="h-8 text-xs"
                onClick={() => onComplete?.(item.id)}
                disabled={isLoading}
              >
                {item.actionLabel}
                <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            )}

            {!item.actionLabel && (
              <Button
                size="sm"
                variant="default"
                className="h-8 text-xs"
                onClick={() => onComplete?.(item.id)}
                disabled={isLoading}
              >
                Mark Complete
                <CheckCircle2 className="w-3 h-3 ml-1" />
              </Button>
            )}

            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs text-muted-foreground"
              onClick={() => onDismiss?.(item.id)}
              disabled={isLoading}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
