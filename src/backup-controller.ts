import { setTimeout as sleep } from "node:timers/promises";
import type { V1CronJob } from "@kubernetes/client-node";

const group = "backup.example.com";
const version = "v1alpha1";
const plural = "databasebackups";
const namespace = "demo";
const apiVersion = `${group}/${version}`;
const watchPath = `/apis/${group}/${version}/namespaces/${namespace}/${plural}`;

type Backup = {
  metadata: { name: string; uid: string; deletionTimestamp?: string };
  spec: { schedule: string; timeZone?: string; connectionSecretName: string; backupPVCName: string };
};
type BackupList = { metadata: { resourceVersion: string }; items: Array<{ metadata: { name: string } }> };
type WatchObject = { metadata?: { name?: string; resourceVersion?: string }; code?: number; message?: string };

export interface BackupClient {
  list(): Promise<unknown>;
  get(name: string): Promise<unknown>;
  readCronJob(name: string): Promise<V1CronJob>;
  createCronJob(job: V1CronJob): Promise<unknown>;
  replaceCronJob(name: string, job: V1CronJob): Promise<unknown>;
  watch(
    path: string,
    params: Record<string, string | number | boolean | undefined>,
    event: (type: string, object: WatchObject) => void,
    done: (error: unknown) => void,
  ): Promise<AbortController>;
}

function statusCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const record = error as { code?: unknown; statusCode?: unknown };
  const code = record.code ?? record.statusCode;
  return typeof code === "number" ? code : undefined;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseList(value: unknown): BackupList {
  if (!record(value) || !record(value.metadata) ||
      typeof value.metadata.resourceVersion !== "string" || !value.metadata.resourceVersion ||
      !Array.isArray(value.items) || !value.items.every(
        (item: unknown) => record(item) && record(item.metadata) &&
          typeof item.metadata.name === "string" && item.metadata.name.length > 0,
      )) {
    throw new Error("Invalid DatabaseBackup list from Kubernetes");
  }
  return value as BackupList;
}

function parseBackup(value: unknown): Backup {
  if (!record(value) || !record(value.metadata) || !record(value.spec) ||
      typeof value.metadata.name !== "string" || !value.metadata.name ||
      typeof value.metadata.uid !== "string" || !value.metadata.uid ||
      typeof value.spec.schedule !== "string" || !value.spec.schedule ||
      typeof value.spec.connectionSecretName !== "string" || !value.spec.connectionSecretName ||
      typeof value.spec.backupPVCName !== "string" || !value.spec.backupPVCName ||
      (value.spec.timeZone !== undefined && (typeof value.spec.timeZone !== "string" || !value.spec.timeZone))) {
    throw new Error("Invalid DatabaseBackup from Kubernetes");
  }
  return value as Backup;
}

function desiredJob(backup: Backup): V1CronJob {
  return {
    apiVersion: "batch/v1",
    kind: "CronJob",
    metadata: {
      name: backup.metadata.name,
      namespace,
      ownerReferences: [{
        apiVersion, kind: "DatabaseBackup", name: backup.metadata.name,
        uid: backup.metadata.uid, controller: true, blockOwnerDeletion: false,
      }],
    },
    spec: {
      schedule: backup.spec.schedule,
      timeZone: backup.spec.timeZone ?? "Etc/UTC",
      concurrencyPolicy: "Forbid",
      jobTemplate: {
        spec: {
          template: {
            spec: {
              restartPolicy: "Never",
              automountServiceAccountToken: false,
              containers: [{
                name: "backup",
                image: "postgres:17",
                command: ["/bin/sh", "-ec"],
                args: [
                  'file="/backups/$(date -u +%Y%m%dT%H%M%SZ)-${HOSTNAME}.dump"; ' +
                  'trap \'rm -f "$file.tmp"\' EXIT; pg_dump -Fc -f "$file.tmp"; mv "$file.tmp" "$file"; ' +
                  'trap - EXIT; printf \'Backup created: %s\\n\' "$file"',
                ],
                envFrom: [{ secretRef: { name: backup.spec.connectionSecretName } }],
                volumeMounts: [{ name: "backups", mountPath: "/backups" }],
              }],
              volumes: [{ name: "backups", persistentVolumeClaim: { claimName: backup.spec.backupPVCName } }],
            },
          },
        },
      },
    },
  };
}

// Ignore server-defaulted fields while checking every field owned by this controller.
function containsDesired(actual: unknown, desired: unknown): boolean {
  if (Array.isArray(desired)) {
    return Array.isArray(actual) && actual.length === desired.length &&
      desired.every((item, index) => containsDesired(actual[index], item));
  }
  if (record(desired)) {
    return record(actual) && Object.entries(desired).every(([key, value]) => containsDesired(actual[key], value));
  }
  return actual === desired;
}

export async function reconcile(client: BackupClient, name: string): Promise<void> {
  let backup: Backup;
  try {
    backup = parseBackup(await client.get(name));
  } catch (error) {
    if (statusCode(error) === 404) return;
    throw error;
  }
  if (backup.metadata.deletionTimestamp) return;
  const desired = desiredJob(backup);
  let current: V1CronJob;
  try {
    current = await client.readCronJob(name);
  } catch (error) {
    if (statusCode(error) !== 404) throw error;
    try {
      await client.createCronJob(desired);
      return;
    } catch (createError) {
      if (statusCode(createError) !== 409) throw createError;
      try {
        current = await client.readCronJob(name);
      } catch (readError) {
        if (statusCode(readError) !== 404) throw readError;
        console.warn(`CronJob ${namespace}/${name} disappeared after a create conflict; reconciliation will retry`);
        return;
      }
    }
  }

  const owner = current.metadata?.ownerReferences?.find((ref) => ref.controller);
  if (!owner || owner.apiVersion !== apiVersion || owner.kind !== "DatabaseBackup" ||
      owner.name !== name || owner.uid !== backup.metadata.uid) {
    console.error(`CronJob ${namespace}/${name} conflicts with DatabaseBackup ${namespace}/${name}`);
    return;
  }

  const wanted = desired.spec!;
  const existing = current.spec;
  if (containsDesired(existing, wanted)) return;
  const pod = wanted.jobTemplate.spec!.template.spec!;
  const oldTemplate = existing?.jobTemplate?.spec?.template;
  current.spec = {
    ...existing,
    ...wanted,
    jobTemplate: {
      ...existing?.jobTemplate,
      ...wanted.jobTemplate,
      spec: {
        ...existing?.jobTemplate?.spec,
        ...wanted.jobTemplate.spec,
        template: {
          ...oldTemplate,
          ...wanted.jobTemplate.spec!.template,
          spec: { ...oldTemplate?.spec, ...pod },
        },
      },
    },
  };
  await client.replaceCronJob(name, current);
}

export class BackupController {
  private readonly pending = new Set<string>();
  private running = false;
  private stopped = false;
  private watchAbort: AbortController | undefined;
  private timer?: ReturnType<typeof setInterval>;

  constructor(private readonly client: BackupClient, private readonly resyncMs = 60_000) {}

  private enqueue(name: string): void {
    this.pending.add(name);
    if (!this.running) void this.drain();
  }

  private async drain(): Promise<void> {
    this.running = true;
    while (!this.stopped && this.pending.size) {
      const name = this.pending.values().next().value;
      if (name === undefined) break;
      this.pending.delete(name);
      try {
        await reconcile(this.client, name);
      } catch (error) {
        console.error(`Failed to reconcile DatabaseBackup ${namespace}/${name}`, error);
      }
    }
    this.running = false;
  }

  private async list(): Promise<string> {
    const list = parseList(await this.client.list());
    for (const item of list.items) this.enqueue(item.metadata.name);
    return list.metadata.resourceVersion;
  }

  private watch(resourceVersion: string): Promise<{ resourceVersion: string; expired: boolean }> {
    return new Promise((resolve) => {
      let finished = false;
      let latest = resourceVersion;
      const finish = (error?: unknown) => {
        if (finished) return;
        finished = true;
        this.watchAbort?.abort();
        this.watchAbort = undefined;
        const expired = statusCode(error) === 410;
        if (error && !expired && !this.stopped) console.error("DatabaseBackup watch ended with an error", error);
        resolve({ resourceVersion: latest, expired });
      };
      void this.client.watch(watchPath, { resourceVersion, allowWatchBookmarks: true }, (type, object) => {
        if (finished) return;
        if (!record(object)) {
          console.error("Invalid DatabaseBackup watch event", object);
          finish({ code: 410 });
          return;
        }
        if (type === "ERROR") {
          finish(object);
          return;
        }
        if ((type === "ADDED" || type === "MODIFIED" || type === "DELETED" || type === "BOOKMARK") &&
            (!object.metadata?.resourceVersion ||
              (type !== "BOOKMARK" && !object.metadata.name))) {
          console.error("Invalid DatabaseBackup watch event", object);
          finish({ code: 410 });
          return;
        }
        if (object.metadata?.resourceVersion) latest = object.metadata.resourceVersion;
        if ((type === "ADDED" || type === "MODIFIED" || type === "DELETED") && object.metadata?.name) {
          this.enqueue(object.metadata.name);
        }
      }, finish).then((controller) => {
        if (finished || this.stopped) controller.abort();
        else this.watchAbort = controller;
      }).catch(finish);
    });
  }

  async run(): Promise<void> {
    this.timer = setInterval(() => {
      void this.list().catch((error: unknown) => console.error("DatabaseBackup periodic list failed", error));
    }, this.resyncMs);
    let resourceVersion: string | undefined;
    while (!this.stopped) {
      try {
        if (!resourceVersion) resourceVersion = await this.list();
        if (this.stopped) break;
        const result = await this.watch(resourceVersion);
        resourceVersion = result.expired ? undefined : result.resourceVersion;
        if (!this.stopped && !result.expired) await sleep(1000);
      } catch (error) {
        console.error("DatabaseBackup list failed", error);
        await sleep(3000);
      }
    }
    if (this.timer) clearInterval(this.timer);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.watchAbort?.abort();
  }
}
