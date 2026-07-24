import { and, asc, eq, isNull } from 'drizzle-orm';
import { videoProjects } from '@1person/core/db';
import { db } from '../lib/db';
import { syncCampaignVideoProject } from '../services/campaign-video-creative';

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_BATCH_SIZE = 5;

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

function videoProviderConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

export class VideoRenderCron {
  private started = false;
  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    const intervalMs = envNumber('VIDEO_RENDER_SYNC_INTERVAL_MS', DEFAULT_INTERVAL_MS);
    console.log(`[VideoRenderCron] Started - checking rendering videos every ${Math.round(intervalMs / 1000)}s`);

    setTimeout(() => {
      this.runCycle().catch((error) => console.warn('[VideoRenderCron] Initial cycle failed:', error));
    }, 10_000);

    this.timer = setInterval(() => {
      this.runCycle().catch((error) => console.warn('[VideoRenderCron] Cycle failed:', error));
    }, intervalMs);
  }

  stop(): void {
    this.started = false;
    if (this.timer) clearInterval(this.timer);
  }

  private async runCycle(): Promise<void> {
    if (this.running) return;
    if (!videoProviderConfigured()) return;

    this.running = true;
    try {
      const batchSize = envNumber('VIDEO_RENDER_SYNC_BATCH_SIZE', DEFAULT_BATCH_SIZE);
      const pendingVideos = await db.select({
        id: videoProjects.id,
        companyId: videoProjects.companyId,
      })
        .from(videoProjects)
        .where(and(
          eq(videoProjects.status, 'rendering'),
          isNull(videoProjects.outputUrl),
        ))
        .orderBy(asc(videoProjects.updatedAt))
        .limit(batchSize);

      if (pendingVideos.length === 0) return;

      await Promise.all(pendingVideos.map(async (video) => {
        try {
          const synced = await syncCampaignVideoProject({
            companyId: video.companyId,
            projectId: video.id,
          });
          if (synced?.status === 'ready') {
            console.log(`[VideoRenderCron] Video ready: ${video.id}`);
          }
          if (synced?.status === 'failed') {
            console.warn(`[VideoRenderCron] Video failed: ${video.id}`);
          }
        } catch (error) {
          console.warn(`[VideoRenderCron] Sync failed for ${video.id}:`, error);
        }
      }));
    } finally {
      this.running = false;
    }
  }
}

export const videoRenderCron = new VideoRenderCron();
