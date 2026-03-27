import { db } from '../lib/db';
import {
  playbooks,
  companyPlaybookProgress,
  tasks,
  agents,
} from '@1person/core/db';
import { eq, and } from 'drizzle-orm';
import type {
  PlaybookStage,
  StageProgressData,
  PlaybookTask,
} from '@1person/core/db';

// Stage order for advancement
const STAGE_ORDER = ['idea', 'mvp', 'launch', 'growth', 'optimize'] as const;
type StageName = (typeof STAGE_ORDER)[number];

interface PlaybookProgressWithDetails {
  id: string;
  companyId: string;
  playbookId: string;
  currentStage: StageName;
  stageStartedAt: Date;
  stageProgress: Record<string, StageProgressData>;
  overallProgress: number;
  status: 'active' | 'paused' | 'completed' | 'abandoned';
  playbook: {
    id: string;
    name: string;
    stages: PlaybookStage[];
  };
  currentStageDetails: PlaybookStage | null;
}

export class PlaybookService {
  /**
   * Start a playbook for a company
   * Creates the progress tracking record and initializes at the first stage
   */
  async startPlaybook(
    companyId: string,
    playbookId: string
  ): Promise<typeof companyPlaybookProgress.$inferSelect> {
    // Check if company already has this playbook
    const existing = await db
      .select()
      .from(companyPlaybookProgress)
      .where(
        and(
          eq(companyPlaybookProgress.companyId, companyId),
          eq(companyPlaybookProgress.playbookId, playbookId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      console.log(`Company ${companyId} already has playbook ${playbookId}`);
      return existing[0];
    }

    // Get the playbook to initialize progress
    const [playbook] = await db
      .select()
      .from(playbooks)
      .where(eq(playbooks.id, playbookId))
      .limit(1);

    if (!playbook) {
      throw new Error(`Playbook ${playbookId} not found`);
    }

    // Initialize stage progress for all stages
    const stages = playbook.stages as PlaybookStage[];
    const initialStageProgress: Record<string, StageProgressData> = {};

    for (const stage of stages) {
      initialStageProgress[stage.stage] = {
        progress: 0,
        tasksCompleted: 0,
        tasksTotal: stage.tasks?.length || 0,
        milestonesAchieved: [],
      };
    }

    // Mark the first stage as started
    if (stages.length > 0) {
      initialStageProgress[stages[0].stage].startedAt = new Date().toISOString();
    }

    const [progress] = await db
      .insert(companyPlaybookProgress)
      .values({
        companyId,
        playbookId,
        currentStage: 'idea',
        stageStartedAt: new Date(),
        stageProgress: initialStageProgress,
        overallProgress: 0,
        status: 'active',
      })
      .returning();

    console.log(
      `Started playbook ${playbookId} for company ${companyId} at stage: idea`
    );
    return progress;
  }

  /**
   * Generate tasks for the current stage of a company's playbook
   * Creates task records in the tasks table
   */
  async generateStageTasks(
    companyId: string,
    stage?: StageName
  ): Promise<typeof tasks.$inferSelect[]> {
    // Get the company's playbook progress
    const [progress] = await db
      .select()
      .from(companyPlaybookProgress)
      .where(eq(companyPlaybookProgress.companyId, companyId))
      .limit(1);

    if (!progress) {
      throw new Error(`No playbook found for company ${companyId}`);
    }

    const targetStage = stage || progress.currentStage;

    // Get the playbook
    const [playbook] = await db
      .select()
      .from(playbooks)
      .where(eq(playbooks.id, progress.playbookId))
      .limit(1);

    if (!playbook) {
      throw new Error(`Playbook ${progress.playbookId} not found`);
    }

    // Find the stage definition
    const stages = playbook.stages as PlaybookStage[];
    const stageDefinition = stages.find((s) => s.stage === targetStage);

    if (!stageDefinition) {
      throw new Error(`Stage ${targetStage} not found in playbook`);
    }

    // Get agents for the company to assign tasks
    const companyAgents = await db
      .select()
      .from(agents)
      .where(eq(agents.companyId, companyId));

    const agentsByRole: Record<string, string> = {};
    for (const agent of companyAgents) {
      agentsByRole[agent.role] = agent.id;
    }

    // Create tasks from the stage definition
    const createdTasks: typeof tasks.$inferSelect[] = [];
    const playbookTasks = (stageDefinition.tasks || []) as PlaybookTask[];

    for (const taskDef of playbookTasks) {
      // Find agent for this task
      let assignedAgentId: string | null = null;
      if (taskDef.assignedRole && agentsByRole[taskDef.assignedRole]) {
        assignedAgentId = agentsByRole[taskDef.assignedRole];
      } else {
        // Default to CEO if no specific role assigned
        assignedAgentId = agentsByRole['ceo'] || companyAgents[0]?.id || null;
      }

      const [task] = await db
        .insert(tasks)
        .values({
          companyId,
          title: taskDef.title,
          description: taskDef.description,
          type: taskDef.type || 'playbook_task',
          priority: taskDef.priority || 'medium',
          assignedAgentId,
          status: 'pending',
          input: {
            type: 'playbook_task',
            data: {
              playbookId: playbook.id,
              stage: targetStage,
              taskId: taskDef.id,
            },
          },
        })
        .returning();

      createdTasks.push(task);
    }

    // Update stage progress with task count
    const currentStageProgress = (progress.stageProgress as Record<string, StageProgressData>) || {};
    currentStageProgress[targetStage] = {
      ...currentStageProgress[targetStage],
      tasksTotal: createdTasks.length,
      tasksCompleted: 0,
      progress: 0,
    };

    await db
      .update(companyPlaybookProgress)
      .set({
        stageProgress: currentStageProgress,
        updatedAt: new Date(),
      })
      .where(eq(companyPlaybookProgress.id, progress.id));

    console.log(
      `Generated ${createdTasks.length} tasks for company ${companyId} stage ${targetStage}`
    );
    return createdTasks;
  }

  /**
   * Check if the current stage is complete
   * Returns completion status and any pending criteria
   */
  async checkStageCompletion(companyId: string): Promise<{
    isComplete: boolean;
    currentStage: StageName;
    completedTasks: number;
    totalTasks: number;
    pendingCriteria: string[];
    milestonesAchieved: string[];
    progress: number;
  }> {
    // Get progress
    const [progress] = await db
      .select()
      .from(companyPlaybookProgress)
      .where(eq(companyPlaybookProgress.companyId, companyId))
      .limit(1);

    if (!progress) {
      throw new Error(`No playbook found for company ${companyId}`);
    }

    // Get playbook
    const [playbook] = await db
      .select()
      .from(playbooks)
      .where(eq(playbooks.id, progress.playbookId))
      .limit(1);

    if (!playbook) {
      throw new Error(`Playbook ${progress.playbookId} not found`);
    }

    const stages = playbook.stages as PlaybookStage[];
    const currentStageDefinition = stages.find(
      (s) => s.stage === progress.currentStage
    );

    if (!currentStageDefinition) {
      throw new Error(`Stage ${progress.currentStage} not found`);
    }

    // Count completed tasks for this stage
    const stageTasks = await db
      .select()
      .from(tasks)
      .where(eq(tasks.companyId, companyId));

    // Filter tasks that belong to this stage
    const stageTaskIds = new Set(
      (currentStageDefinition.tasks || []).map((t: PlaybookTask) => t.id)
    );
    const relevantTasks = stageTasks.filter((t) => {
      const input = t.input as { data?: { taskId?: string } } | null;
      return input?.data?.taskId && stageTaskIds.has(input.data.taskId);
    });

    const completedTasks = relevantTasks.filter(
      (t) => t.status === 'completed'
    ).length;
    const totalTasks = relevantTasks.length;

    // Get stage progress data
    const stageProgress = (progress.stageProgress as Record<string, StageProgressData>) || {};
    const currentProgress = stageProgress[progress.currentStage] || {
      progress: 0,
      milestonesAchieved: [],
    };

    // Calculate progress percentage
    const progressPercent =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Check exit criteria (simplified - in a full implementation, these would be evaluated programmatically)
    const exitCriteria = currentStageDefinition.exitCriteria || [];
    const pendingCriteria =
      progressPercent < 80 ? exitCriteria : exitCriteria.slice(0, 1); // Simplified logic

    const isComplete = progressPercent >= 80 && pendingCriteria.length === 0;

    return {
      isComplete,
      currentStage: progress.currentStage as StageName,
      completedTasks,
      totalTasks,
      pendingCriteria: isComplete ? [] : pendingCriteria,
      milestonesAchieved: currentProgress.milestonesAchieved || [],
      progress: progressPercent,
    };
  }

  /**
   * Advance to the next stage
   * Updates progress and marks current stage as completed
   */
  async advanceToNextStage(companyId: string): Promise<{
    previousStage: StageName;
    newStage: StageName | null;
    isPlaybookComplete: boolean;
  }> {
    // Get current progress
    const [progress] = await db
      .select()
      .from(companyPlaybookProgress)
      .where(eq(companyPlaybookProgress.companyId, companyId))
      .limit(1);

    if (!progress) {
      throw new Error(`No playbook found for company ${companyId}`);
    }

    const currentStageIndex = STAGE_ORDER.indexOf(
      progress.currentStage as StageName
    );
    const previousStage = progress.currentStage as StageName;

    // Check if there's a next stage
    if (currentStageIndex >= STAGE_ORDER.length - 1) {
      // Complete the playbook
      const stageProgress = (progress.stageProgress as Record<string, StageProgressData>) || {};
      stageProgress[previousStage] = {
        ...stageProgress[previousStage],
        completedAt: new Date().toISOString(),
        progress: 100,
      };

      await db
        .update(companyPlaybookProgress)
        .set({
          status: 'completed',
          overallProgress: 100,
          stageProgress,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(companyPlaybookProgress.id, progress.id));

      console.log(`Playbook completed for company ${companyId}`);
      return {
        previousStage,
        newStage: null,
        isPlaybookComplete: true,
      };
    }

    // Advance to next stage
    const newStage = STAGE_ORDER[currentStageIndex + 1];
    const stageProgress = (progress.stageProgress as Record<string, StageProgressData>) || {};

    // Mark previous stage as completed
    stageProgress[previousStage] = {
      ...stageProgress[previousStage],
      completedAt: new Date().toISOString(),
      progress: 100,
    };

    // Initialize new stage
    stageProgress[newStage] = {
      ...stageProgress[newStage],
      startedAt: new Date().toISOString(),
      progress: 0,
      tasksCompleted: 0,
    };

    // Calculate overall progress
    const overallProgress = Math.round(
      ((currentStageIndex + 1) / STAGE_ORDER.length) * 100
    );

    await db
      .update(companyPlaybookProgress)
      .set({
        currentStage: newStage,
        stageStartedAt: new Date(),
        stageProgress,
        overallProgress,
        updatedAt: new Date(),
      })
      .where(eq(companyPlaybookProgress.id, progress.id));

    console.log(
      `Company ${companyId} advanced from ${previousStage} to ${newStage}`
    );
    return {
      previousStage,
      newStage,
      isPlaybookComplete: false,
    };
  }

  /**
   * Get the current playbook progress for a company
   * Returns full details including playbook stages and current stage info
   */
  async getProgress(
    companyId: string
  ): Promise<PlaybookProgressWithDetails | null> {
    const [progress] = await db
      .select()
      .from(companyPlaybookProgress)
      .where(eq(companyPlaybookProgress.companyId, companyId))
      .limit(1);

    if (!progress) {
      return null;
    }

    // Get the playbook details
    const [playbook] = await db
      .select()
      .from(playbooks)
      .where(eq(playbooks.id, progress.playbookId))
      .limit(1);

    if (!playbook) {
      return null;
    }

    const stages = playbook.stages as PlaybookStage[];
    const currentStageDetails =
      stages.find((s) => s.stage === progress.currentStage) || null;

    return {
      id: progress.id,
      companyId: progress.companyId,
      playbookId: progress.playbookId,
      currentStage: progress.currentStage as StageName,
      stageStartedAt: progress.stageStartedAt,
      stageProgress: (progress.stageProgress as Record<string, StageProgressData>) || {},
      overallProgress: progress.overallProgress || 0,
      status: progress.status as 'active' | 'paused' | 'completed' | 'abandoned',
      playbook: {
        id: playbook.id,
        name: playbook.name,
        stages,
      },
      currentStageDetails,
    };
  }

  /**
   * Update task completion and recalculate stage progress
   */
  async updateTaskCompletion(
    companyId: string,
    taskId: string,
    isCompleted: boolean
  ): Promise<void> {
    // Get progress
    const [progress] = await db
      .select()
      .from(companyPlaybookProgress)
      .where(eq(companyPlaybookProgress.companyId, companyId))
      .limit(1);

    if (!progress) {
      return;
    }

    // Get playbook
    const [playbook] = await db
      .select()
      .from(playbooks)
      .where(eq(playbooks.id, progress.playbookId))
      .limit(1);

    if (!playbook) {
      return;
    }

    const stages = playbook.stages as PlaybookStage[];
    const currentStageDefinition = stages.find(
      (s) => s.stage === progress.currentStage
    );

    if (!currentStageDefinition) {
      return;
    }

    // Count completed tasks for this stage
    const stageTasks = await db
      .select()
      .from(tasks)
      .where(eq(tasks.companyId, companyId));

    const stageTaskIds = new Set(
      (currentStageDefinition.tasks || []).map((t: PlaybookTask) => t.id)
    );
    const relevantTasks = stageTasks.filter((t) => {
      const input = t.input as { data?: { taskId?: string } } | null;
      return input?.data?.taskId && stageTaskIds.has(input.data.taskId);
    });

    const completedTasks = relevantTasks.filter(
      (t) => t.status === 'completed'
    ).length;
    const totalTasks = relevantTasks.length;

    // Update stage progress
    const stageProgress = (progress.stageProgress as Record<string, StageProgressData>) || {};
    stageProgress[progress.currentStage] = {
      ...stageProgress[progress.currentStage],
      tasksCompleted: completedTasks,
      tasksTotal: totalTasks,
      progress: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    };

    await db
      .update(companyPlaybookProgress)
      .set({
        stageProgress,
        updatedAt: new Date(),
      })
      .where(eq(companyPlaybookProgress.id, progress.id));
  }

  /**
   * Mark a milestone as achieved
   */
  async achieveMilestone(
    companyId: string,
    milestoneId: string
  ): Promise<void> {
    const [progress] = await db
      .select()
      .from(companyPlaybookProgress)
      .where(eq(companyPlaybookProgress.companyId, companyId))
      .limit(1);

    if (!progress) {
      return;
    }

    const stageProgress = (progress.stageProgress as Record<string, StageProgressData>) || {};
    const currentProgress = stageProgress[progress.currentStage] || {
      milestonesAchieved: [],
    };

    if (!currentProgress.milestonesAchieved.includes(milestoneId)) {
      currentProgress.milestonesAchieved.push(milestoneId);
      stageProgress[progress.currentStage] = currentProgress;

      await db
        .update(companyPlaybookProgress)
        .set({
          stageProgress,
          updatedAt: new Date(),
        })
        .where(eq(companyPlaybookProgress.id, progress.id));

      console.log(
        `Milestone ${milestoneId} achieved for company ${companyId}`
      );
    }
  }

  /**
   * Get playbook by ID
   */
  async getPlaybook(playbookId: string) {
    const [playbook] = await db
      .select()
      .from(playbooks)
      .where(eq(playbooks.id, playbookId))
      .limit(1);
    return playbook || null;
  }

  /**
   * Get all active playbooks
   */
  async getAllPlaybooks() {
    return db.select().from(playbooks).where(eq(playbooks.isActive, 1));
  }
}

export const playbookService = new PlaybookService();
