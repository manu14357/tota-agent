import cron, { type ScheduledTask as CronScheduledTask } from 'node-cron';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { TotaConfig } from '../utils/config.js';
import { getTotaHome } from '../utils/config.js';
import { logger } from '../utils/logger.js';

export interface ScheduledTask {
  id: string;
  cron: string;
  handler: () => Promise<void>;
  description: string;
  /**
   * H6: IANA timezone for cron interpretation. Optional — defaults to
   * host local time.
   */
  timezone?: string;
}

export interface ScheduledTaskManifest {
  id: string;
  cron?: string;
  description: string;
  skillName?: string;
  prompt?: string;
  delaySeconds?: number;
  executeAt?: string;
  createdAt: string;
  sourceChannelId?: string;
  sourceChannelType?: string;
  /**
   * H6: IANA timezone (e.g. "America/Los_Angeles") used to interpret
   * the cron expression. If unset, node-cron uses the host's local
   * timezone — which is usually UTC on a server, but the user expects
   * their own wall clock. The CLI setup defaults this to
   * Intl.DateTimeFormat().resolvedOptions().timeZone.
   */
  timezone?: string;
}

const SCHEDULES_FILE = 'schedules.yaml';

function getSchedulesPath(): string {
  return join(getTotaHome(), SCHEDULES_FILE);
}

export function loadSchedules(): ScheduledTaskManifest[] {
  const path = getSchedulesPath();
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, 'utf-8');
    const data = parseYaml(raw) as { tasks?: ScheduledTaskManifest[] };
    return data.tasks || [];
  } catch (err) {
    logger.warn({ err }, 'Failed to load schedules.yaml');
    return [];
  }
}

export function saveSchedules(tasks: ScheduledTaskManifest[]): void {
  const path = getSchedulesPath();
  const dir = getTotaHome();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, stringifyYaml({ tasks }), 'utf-8');
}

export class Scheduler {
  private tasks: Map<string, CronScheduledTask> = new Map();
  private delayedTasks: Map<string, NodeJS.Timeout> = new Map();
  private taskManifests: Map<string, ScheduledTaskManifest> = new Map();
  private heartbeatIntervalMinutes: number;
  private heartbeatHandler?: () => Promise<void>;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(
    config: TotaConfig,
    private onScheduledTask?: (manifest: ScheduledTaskManifest) => Promise<void>,
  ) {
    this.heartbeatIntervalMinutes = config.heartbeat.intervalMinutes;
  }

  setOnScheduledTask(handler: (manifest: ScheduledTaskManifest) => Promise<void>): void {
    this.onScheduledTask = handler;
  }

  onHeartbeat(handler: () => Promise<void>): void {
    this.heartbeatHandler = handler;
  }

  startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    const ms = this.heartbeatIntervalMinutes * 60 * 1000;
    logger.info({ intervalMin: this.heartbeatIntervalMinutes }, 'Heartbeat started');

    this.heartbeatTimer = setInterval(async () => {
      try {
        await this.heartbeatHandler?.();
      } catch (err) {
        logger.error({ err }, 'Heartbeat error');
      }
    }, ms);
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      logger.info('Heartbeat stopped');
    }
  }

  addTask(task: ScheduledTask): void {
    if (this.tasks.has(task.id)) {
      this.removeTask(task.id);
    }
    // H6: pass timezone to cron.schedule so the user-scheduled "0 9 * * *"
    // fires at 9 AM in their timezone, not at 9 AM in the server's timezone.
    const scheduled = cron.schedule(task.cron, async () => {
      try {
        await task.handler();
      } catch (err) {
        logger.error({ task: task.id, err }, 'Scheduled task error');
      }
    }, task.timezone ? { timezone: task.timezone } : undefined);
    this.tasks.set(task.id, scheduled);
    logger.info({ id: task.id, cron: task.cron, desc: task.description, tz: task.timezone }, 'Task scheduled');
  }

  addPersistedTask(manifest: ScheduledTaskManifest): void {
    this.taskManifests.set(manifest.id, manifest);
    this.addTask({
      id: manifest.id,
      cron: manifest.cron!,
      description: manifest.description,
      timezone: manifest.timezone,
      handler: async () => {
        logger.info({ task: manifest.id }, 'Scheduled task firing');
        if (this.onScheduledTask) {
          await this.onScheduledTask(manifest);
        }
      },
    });
  }

  /**
   * H4: Update an existing scheduled task's manifest and re-register the cron
   * with the new expression. The previously registered cron is stopped before
   * the new one is scheduled. The persisted schedules.yaml is updated so the
   * change survives a restart.
   */
  updatePersistedTask(id: string, patch: Partial<Pick<ScheduledTaskManifest, 'cron' | 'description' | 'prompt' | 'delaySeconds' | 'executeAt' | 'skillName'>>): boolean {
    const manifest = this.taskManifests.get(id);
    if (!manifest) return false;
    if (patch.cron !== undefined) {
      if (!patch.cron || !cron.validate(patch.cron)) {
        throw new Error(`Invalid cron expression: ${patch.cron}`);
      }
    }
    const updated: ScheduledTaskManifest = { ...manifest, ...patch, id: manifest.id, createdAt: manifest.createdAt };
    this.taskManifests.set(id, updated);
    // Re-register the cron if it has one
    if (updated.cron) {
      this.removeTask(id);
      this.addPersistedTask(updated);
    }
    this.persistSchedules();
    logger.info({ id, patch }, 'Scheduled task updated');
    return true;
  }

  addDelayedTask(manifest: ScheduledTaskManifest): void {
    this.taskManifests.set(manifest.id, manifest);
    const delayMs = (manifest.delaySeconds || 60) * 1000;

    const timer = setTimeout(async () => {
      try {
        logger.info({ task: manifest.id }, 'Delayed task firing');
        if (this.onScheduledTask) {
          await this.onScheduledTask(manifest);
        }
      } catch (err) {
        logger.error({ task: manifest.id, err }, 'Delayed task error');
      } finally {
        this.delayedTasks.delete(manifest.id);
        this.taskManifests.delete(manifest.id);
        this.persistSchedules();
      }
    }, delayMs);

    this.delayedTasks.set(manifest.id, timer);
    logger.info({ id: manifest.id, delaySeconds: manifest.delaySeconds }, 'Delayed task scheduled');
  }

  removeTask(id: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.stop();
      this.tasks.delete(id);
    }
    const timer = this.delayedTasks.get(id);
    if (timer) {
      clearTimeout(timer);
      this.delayedTasks.delete(id);
    }
    this.taskManifests.delete(id);
  }

  getManifests(): ScheduledTaskManifest[] {
    return [...this.taskManifests.values()];
  }

  /**
   * M7: Maximum grace period (ms) for a delayed task that expired while
   * the daemon was down. If the task was supposed to fire within this
   * window, fire it immediately on restart. Beyond this window, the
   * reminder is considered stale and is dropped (the user was offline
   * too long).
   */
  private static readonly EXPIRED_GRACE_MS = 5 * 60 * 1000; // 5 minutes

  restorePersistedTasks(): void {
    const persisted = loadSchedules();
    for (const manifest of persisted) {
      // M7: identify delayed tasks by `executeAt` (always set when a
      // task is scheduled with a delay) OR by `delaySeconds > 0`. The
      // truthy-check on `delaySeconds` alone misses tasks that already
      // fired their timer during downtime.
      const isDelayed = !!manifest.executeAt || (typeof manifest.delaySeconds === 'number' && manifest.delaySeconds > 0);
      if (isDelayed) {
        const executeAt = manifest.executeAt ? new Date(manifest.executeAt) : null;
        const now = Date.now();
        if (executeAt && executeAt.getTime() > now) {
          const remainingMs = executeAt.getTime() - now;
          manifest.delaySeconds = Math.ceil(remainingMs / 1000);
          this.addDelayedTask(manifest);
        } else if (executeAt && executeAt.getTime() > now - Scheduler.EXPIRED_GRACE_MS) {
          // M7: Task was supposed to fire during downtime but only just
          // missed its window. Fire it immediately on restart so the user
          // still gets their reminder.
          logger.info({ id: manifest.id, expiredMs: now - executeAt.getTime() }, 'Firing recently-expired delayed task on startup');
          // Fire-and-forget — we don't await so the rest of the loop proceeds
          if (this.onScheduledTask) {
            this.onScheduledTask(manifest).catch((err) => {
              logger.error({ err, task: manifest.id }, 'Failed to fire expired delayed task');
            });
          }
          // Remove from manifests (it's done)
          this.taskManifests.delete(manifest.id);
        } else {
          logger.info({ id: manifest.id, expiredMs: executeAt ? now - executeAt.getTime() : null }, 'Delayed task expired too long ago, skipping');
        }
      } else if (manifest.cron && cron.validate(manifest.cron)) {
        this.addPersistedTask(manifest);
      } else {
        logger.warn({ id: manifest.id, cron: manifest.cron }, 'Skipping invalid task');
      }
    }
    if (persisted.length > 0) {
      logger.info({ count: persisted.length }, 'Restored persisted scheduled tasks');
    }
  }

  persistSchedules(): void {
    saveSchedules(this.getManifests());
  }

  stopAll(): void {
    this.stopHeartbeat();
    for (const [, task] of this.tasks) {
      task.stop();
    }
    for (const [, timer] of this.delayedTasks) {
      clearTimeout(timer);
    }
    this.tasks.clear();
    this.delayedTasks.clear();
    this.taskManifests.clear();
  }
}