import { db } from '../lib/db';
import {
  onboardingGuidance,
  onboardingProgress,
  playbooks,
  companyPlaybookProgress,
} from '@1person/core/db';
import { eq, and, inArray } from 'drizzle-orm';
import type {
  PlaybookStage,
  PlaybookMilestone,
  GuidanceCondition,
} from '@1person/core/db';

type GuidanceType =
  | 'setup_task'
  | 'milestone'
  | 'recommendation'
  | 'tutorial'
  | 'insight';
type GuidancePriority = 'critical' | 'high' | 'medium' | 'low';
type GuidanceStatus = 'pending' | 'shown' | 'completed' | 'dismissed' | 'expired';

interface GuidanceItem {
  id: string;
  companyId: string;
  type: GuidanceType;
  title: string;
  description: string | null;
  actionUrl: string | null;
  actionLabel: string | null;
  actionType: string | null;
  icon: string | null;
  color: string | null;
  sequence: number;
  priority: GuidancePriority;
  status: GuidanceStatus;
  stageId: string | null;
  sourceType: string | null;
  createdAt: Date;
}

// Default guidance templates for each stage
const STAGE_GUIDANCE: Record<
  string,
  {
    type: GuidanceType;
    title: string;
    description: string;
    actionLabel?: string;
    actionType?: string;
    icon?: string;
    color?: string;
    priority: GuidancePriority;
  }[]
> = {
  idea: [
    {
      type: 'setup_task',
      title: 'Define your target customer',
      description: 'Create a detailed profile of who your ideal customer is. This will guide all your decisions.',
      actionLabel: 'Get Started',
      actionType: 'task',
      icon: 'user',
      color: '#3b82f6',
      priority: 'critical',
    },
    {
      type: 'setup_task',
      title: 'Write your value proposition',
      description: 'Clearly articulate the unique value you provide to customers.',
      actionLabel: 'Write Now',
      actionType: 'task',
      icon: 'edit',
      color: '#10b981',
      priority: 'high',
    },
    {
      type: 'tutorial',
      title: 'How to validate your idea',
      description: 'Learn the best practices for validating your business idea before investing too much time.',
      actionLabel: 'Watch Tutorial',
      actionType: 'modal',
      icon: 'play',
      color: '#8b5cf6',
      priority: 'medium',
    },
    {
      type: 'setup_task',
      title: 'Talk to potential customers',
      description: 'Schedule and complete 5 customer discovery interviews to validate your assumptions.',
      actionLabel: 'Schedule Interviews',
      actionType: 'task',
      icon: 'message-circle',
      color: '#f59e0b',
      priority: 'high',
    },
    {
      type: 'recommendation',
      title: 'Set up your landing page',
      description: 'Create a simple landing page to collect early interest and validate demand.',
      actionLabel: 'Create Page',
      actionType: 'link',
      icon: 'layout',
      color: '#ec4899',
      priority: 'medium',
    },
  ],
  mvp: [
    {
      type: 'setup_task',
      title: 'Define your MVP scope',
      description: 'List the minimum features needed for your first version. Less is more!',
      actionLabel: 'Define Features',
      actionType: 'task',
      icon: 'list',
      color: '#3b82f6',
      priority: 'critical',
    },
    {
      type: 'setup_task',
      title: 'Build your core feature',
      description: 'Focus on building the one feature that delivers the most value.',
      actionLabel: 'Start Building',
      actionType: 'task',
      icon: 'code',
      color: '#10b981',
      priority: 'critical',
    },
    {
      type: 'tutorial',
      title: 'MVP best practices',
      description: 'Learn how to build an MVP that actually validates your business.',
      actionLabel: 'Learn More',
      actionType: 'modal',
      icon: 'book',
      color: '#8b5cf6',
      priority: 'medium',
    },
    {
      type: 'setup_task',
      title: 'Recruit beta users',
      description: 'Find 10 people willing to test your MVP and provide feedback.',
      actionLabel: 'Find Testers',
      actionType: 'task',
      icon: 'users',
      color: '#f59e0b',
      priority: 'high',
    },
    {
      type: 'recommendation',
      title: 'Set up analytics',
      description: 'Install analytics to understand how users interact with your product.',
      actionLabel: 'Add Analytics',
      actionType: 'link',
      icon: 'bar-chart',
      color: '#ec4899',
      priority: 'medium',
    },
  ],
  launch: [
    {
      type: 'setup_task',
      title: 'Prepare your launch checklist',
      description: 'Create a comprehensive checklist of everything needed for launch.',
      actionLabel: 'Create Checklist',
      actionType: 'task',
      icon: 'check-square',
      color: '#3b82f6',
      priority: 'critical',
    },
    {
      type: 'setup_task',
      title: 'Write your launch announcement',
      description: 'Craft a compelling announcement for your launch.',
      actionLabel: 'Write Announcement',
      actionType: 'task',
      icon: 'megaphone',
      color: '#10b981',
      priority: 'high',
    },
    {
      type: 'setup_task',
      title: 'Set up customer support',
      description: 'Prepare to handle customer questions and issues.',
      actionLabel: 'Setup Support',
      actionType: 'task',
      icon: 'headphones',
      color: '#f59e0b',
      priority: 'high',
    },
    {
      type: 'recommendation',
      title: 'Plan your launch channels',
      description: 'Decide where you will announce your launch (Product Hunt, social media, email).',
      actionLabel: 'Plan Channels',
      actionType: 'task',
      icon: 'share-2',
      color: '#8b5cf6',
      priority: 'high',
    },
    {
      type: 'milestone',
      title: 'Launch day!',
      description: 'Execute your launch plan and start acquiring your first customers.',
      actionLabel: 'Launch',
      actionType: 'task',
      icon: 'rocket',
      color: '#ef4444',
      priority: 'critical',
    },
  ],
  growth: [
    {
      type: 'setup_task',
      title: 'Analyze your acquisition channels',
      description: 'Understand which channels are driving the best results.',
      actionLabel: 'View Analytics',
      actionType: 'link',
      icon: 'trending-up',
      color: '#3b82f6',
      priority: 'high',
    },
    {
      type: 'setup_task',
      title: 'Optimize your conversion funnel',
      description: 'Identify and fix drop-off points in your user journey.',
      actionLabel: 'Optimize',
      actionType: 'task',
      icon: 'filter',
      color: '#10b981',
      priority: 'high',
    },
    {
      type: 'recommendation',
      title: 'Set up a referral program',
      description: 'Create incentives for your customers to refer others.',
      actionLabel: 'Create Program',
      actionType: 'task',
      icon: 'gift',
      color: '#f59e0b',
      priority: 'medium',
    },
    {
      type: 'setup_task',
      title: 'Reduce churn',
      description: 'Understand why users leave and implement retention strategies.',
      actionLabel: 'Analyze Churn',
      actionType: 'task',
      icon: 'user-minus',
      color: '#ef4444',
      priority: 'critical',
    },
    {
      type: 'insight',
      title: 'Growth metrics review',
      description: 'Review your key growth metrics weekly to stay on track.',
      actionLabel: 'View Metrics',
      actionType: 'link',
      icon: 'activity',
      color: '#8b5cf6',
      priority: 'medium',
    },
  ],
  optimize: [
    {
      type: 'setup_task',
      title: 'Document your processes',
      description: 'Create SOPs for all recurring operations.',
      actionLabel: 'Create SOPs',
      actionType: 'task',
      icon: 'file-text',
      color: '#3b82f6',
      priority: 'high',
    },
    {
      type: 'setup_task',
      title: 'Automate repetitive tasks',
      description: 'Identify and automate tasks that your agents do repeatedly.',
      actionLabel: 'Automate',
      actionType: 'task',
      icon: 'zap',
      color: '#10b981',
      priority: 'high',
    },
    {
      type: 'recommendation',
      title: 'Review unit economics',
      description: 'Ensure your business model is sustainable and profitable.',
      actionLabel: 'Review',
      actionType: 'link',
      icon: 'dollar-sign',
      color: '#f59e0b',
      priority: 'critical',
    },
    {
      type: 'insight',
      title: 'Prepare for scale',
      description: 'Review your infrastructure and team capacity for the next growth phase.',
      actionLabel: 'Plan',
      actionType: 'task',
      icon: 'layers',
      color: '#8b5cf6',
      priority: 'medium',
    },
    {
      type: 'milestone',
      title: 'Congratulations!',
      description: 'You have built and optimized a running business. Time to scale!',
      actionLabel: 'View Progress',
      actionType: 'modal',
      icon: 'award',
      color: '#ec4899',
      priority: 'low',
    },
  ],
};

export class GuidanceService {
  /**
   * Generate initial guidance items for a company based on their playbook
   * Called after company creation during FTUX
   */
  async generateInitialGuidance(
    companyId: string,
    playbookId: string
  ): Promise<typeof onboardingGuidance.$inferSelect[]> {
    // Get the playbook
    const [playbook] = await db
      .select()
      .from(playbooks)
      .where(eq(playbooks.id, playbookId))
      .limit(1);

    if (!playbook) {
      console.warn(`Playbook ${playbookId} not found`);
      return [];
    }

    // Get current stage from progress
    const [progress] = await db
      .select()
      .from(companyPlaybookProgress)
      .where(eq(companyPlaybookProgress.companyId, companyId))
      .limit(1);

    const currentStage = progress?.currentStage || 'idea';

    // Get guidance templates for this stage
    const stageGuidanceTemplates = STAGE_GUIDANCE[currentStage] || STAGE_GUIDANCE.idea;

    // Create guidance items
    const createdGuidance: typeof onboardingGuidance.$inferSelect[] = [];

    for (let i = 0; i < stageGuidanceTemplates.length; i++) {
      const template = stageGuidanceTemplates[i];

      const [guidance] = await db
        .insert(onboardingGuidance)
        .values({
          companyId,
          type: template.type,
          title: template.title,
          description: template.description,
          actionLabel: template.actionLabel,
          actionType: template.actionType,
          icon: template.icon,
          color: template.color,
          priority: template.priority,
          sequence: i + 1,
          status: 'pending',
          sourceType: 'playbook',
          sourceId: playbookId,
          stageId: currentStage,
        })
        .returning();

      createdGuidance.push(guidance);
    }

    // Create or update onboarding progress
    const existingProgress = await db
      .select()
      .from(onboardingProgress)
      .where(eq(onboardingProgress.companyId, companyId))
      .limit(1);

    if (existingProgress.length === 0) {
      await db.insert(onboardingProgress).values({
        companyId,
        totalSteps: createdGuidance.length,
        completedSteps: 0,
        currentStepNumber: 1,
        percentComplete: 0,
        status: 'in_progress',
      });
    }

    console.log(
      `Generated ${createdGuidance.length} guidance items for company ${companyId}`
    );
    return createdGuidance;
  }

  /**
   * Get active (non-completed, non-dismissed) guidance for a company
   */
  async getActiveGuidance(companyId: string): Promise<GuidanceItem[]> {
    const guidance = await db
      .select()
      .from(onboardingGuidance)
      .where(
        and(
          eq(onboardingGuidance.companyId, companyId),
          inArray(onboardingGuidance.status, ['pending', 'shown'])
        )
      );

    // Sort by priority and sequence
    const priorityOrder: Record<GuidancePriority, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };

    return guidance.sort((a, b) => {
      const priorityDiff =
        priorityOrder[a.priority as GuidancePriority] -
        priorityOrder[b.priority as GuidancePriority];
      if (priorityDiff !== 0) return priorityDiff;
      return (a.sequence || 0) - (b.sequence || 0);
    }) as GuidanceItem[];
  }

  /**
   * Get all guidance for a company (including completed)
   */
  async getAllGuidance(companyId: string): Promise<GuidanceItem[]> {
    const guidance = await db
      .select()
      .from(onboardingGuidance)
      .where(eq(onboardingGuidance.companyId, companyId));

    return guidance.sort(
      (a, b) => (a.sequence || 0) - (b.sequence || 0)
    ) as GuidanceItem[];
  }

  /**
   * Mark a guidance item as shown
   */
  async markAsShown(guidanceId: string): Promise<void> {
    await db
      .update(onboardingGuidance)
      .set({
        status: 'shown',
        shownAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(onboardingGuidance.id, guidanceId));
  }

  /**
   * Complete a guidance item
   */
  async completeGuidance(guidanceId: string): Promise<void> {
    const [guidance] = await db
      .select()
      .from(onboardingGuidance)
      .where(eq(onboardingGuidance.id, guidanceId))
      .limit(1);

    if (!guidance) {
      throw new Error(`Guidance ${guidanceId} not found`);
    }

    // Update guidance status
    await db
      .update(onboardingGuidance)
      .set({
        status: 'completed',
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(onboardingGuidance.id, guidanceId));

    // Update onboarding progress
    await this.updateOnboardingProgress(guidance.companyId);

    console.log(`Guidance ${guidanceId} marked as completed`);
  }

  /**
   * Dismiss a guidance item
   */
  async dismissGuidance(guidanceId: string): Promise<void> {
    const [guidance] = await db
      .select()
      .from(onboardingGuidance)
      .where(eq(onboardingGuidance.id, guidanceId))
      .limit(1);

    if (!guidance) {
      throw new Error(`Guidance ${guidanceId} not found`);
    }

    await db
      .update(onboardingGuidance)
      .set({
        status: 'dismissed',
        dismissedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(onboardingGuidance.id, guidanceId));

    // Update onboarding progress (dismissed items count towards completion)
    await this.updateOnboardingProgress(guidance.companyId);

    console.log(`Guidance ${guidanceId} dismissed`);
  }

  /**
   * Refresh guidance based on current progress
   * Generates new guidance items for the current stage if needed
   */
  async refreshGuidance(companyId: string): Promise<GuidanceItem[]> {
    // Get current playbook progress
    const [progress] = await db
      .select()
      .from(companyPlaybookProgress)
      .where(eq(companyPlaybookProgress.companyId, companyId))
      .limit(1);

    if (!progress) {
      console.warn(`No playbook progress found for company ${companyId}`);
      return [];
    }

    // Check if we have guidance for the current stage
    const currentStageGuidance = await db
      .select()
      .from(onboardingGuidance)
      .where(
        and(
          eq(onboardingGuidance.companyId, companyId),
          eq(onboardingGuidance.stageId, progress.currentStage)
        )
      );

    // If no guidance for current stage, generate it
    if (currentStageGuidance.length === 0) {
      return this.generateInitialGuidance(companyId, progress.playbookId);
    }

    // Return current active guidance
    return this.getActiveGuidance(companyId);
  }

  /**
   * Get onboarding progress summary
   */
  async getOnboardingProgress(companyId: string): Promise<{
    totalSteps: number;
    completedSteps: number;
    percentComplete: number;
    status: string;
    currentStep: GuidanceItem | null;
  }> {
    const [progress] = await db
      .select()
      .from(onboardingProgress)
      .where(eq(onboardingProgress.companyId, companyId))
      .limit(1);

    const activeGuidance = await this.getActiveGuidance(companyId);
    const currentStep = activeGuidance[0] || null;

    if (!progress) {
      return {
        totalSteps: 0,
        completedSteps: 0,
        percentComplete: 0,
        status: 'not_started',
        currentStep,
      };
    }

    return {
      totalSteps: progress.totalSteps || 0,
      completedSteps: progress.completedSteps || 0,
      percentComplete: progress.percentComplete || 0,
      status: progress.status || 'in_progress',
      currentStep,
    };
  }

  /**
   * Update onboarding progress after completing/dismissing guidance
   */
  private async updateOnboardingProgress(companyId: string): Promise<void> {
    // Count total and completed guidance
    const allGuidance = await db
      .select()
      .from(onboardingGuidance)
      .where(eq(onboardingGuidance.companyId, companyId));

    const total = allGuidance.length;
    const completed = allGuidance.filter(
      (g) => g.status === 'completed' || g.status === 'dismissed'
    ).length;
    const percentComplete = total > 0 ? Math.round((completed / total) * 100) : 0;
    const status = percentComplete >= 100 ? 'completed' : 'in_progress';

    // Find current step (first pending/shown item)
    const activeItems = allGuidance
      .filter((g) => g.status === 'pending' || g.status === 'shown')
      .sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

    const currentStepNumber =
      activeItems.length > 0 ? activeItems[0].sequence || 1 : total;

    await db
      .update(onboardingProgress)
      .set({
        totalSteps: total,
        completedSteps: completed,
        currentStepNumber,
        percentComplete,
        status,
        lastActivityAt: new Date(),
        completedAt: status === 'completed' ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(onboardingProgress.companyId, companyId));
  }

  /**
   * Add a custom guidance item (e.g., from AI recommendations)
   */
  async addCustomGuidance(
    companyId: string,
    guidance: {
      type: GuidanceType;
      title: string;
      description: string;
      actionUrl?: string;
      actionLabel?: string;
      actionType?: string;
      icon?: string;
      color?: string;
      priority: GuidancePriority;
      stageId?: string;
    }
  ): Promise<typeof onboardingGuidance.$inferSelect> {
    // Get current max sequence
    const existingGuidance = await db
      .select()
      .from(onboardingGuidance)
      .where(eq(onboardingGuidance.companyId, companyId));

    const maxSequence = Math.max(...existingGuidance.map((g) => g.sequence || 0), 0);

    const [newGuidance] = await db
      .insert(onboardingGuidance)
      .values({
        companyId,
        type: guidance.type,
        title: guidance.title,
        description: guidance.description,
        actionUrl: guidance.actionUrl,
        actionLabel: guidance.actionLabel,
        actionType: guidance.actionType,
        icon: guidance.icon,
        color: guidance.color,
        priority: guidance.priority,
        sequence: maxSequence + 1,
        status: 'pending',
        sourceType: 'ai',
        stageId: guidance.stageId,
      })
      .returning();

    // Update total steps in progress
    await this.updateOnboardingProgress(companyId);

    return newGuidance;
  }
}

export const guidanceService = new GuidanceService();
