import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { BatchV1Api, KubeConfig } from "@kubernetes/client-node";
import type { V1CronJob } from "@kubernetes/client-node";
import { BackupController, reconcile } from "../backup-controller";
import type { BackupClient } from "../backup-controller";

const backup = {
  metadata: { name: "nightly", uid: "uid-1" },
  spec: { schedule: "0 2 * * *", connectionSecretName: "db-secret", backupPVCName: "backups" },
};

function fakeClient() {
  let job: V1CronJob | undefined;
  const callbacks: Array<{
    event: Parameters<BackupClient["watch"]>[2];
    done: Parameters<BackupClient["watch"]>[3];
  }> = [];
  const client = {
    list: vi.fn(async () => ({ metadata: { resourceVersion: "10" }, items: [backup] })),
    get: vi.fn(async () => structuredClone(backup)),
    readCronJob: vi.fn(async () => {
      if (!job) throw { code: 404 };
      return structuredClone(job);
    }),
    createCronJob: vi.fn(async (value: V1CronJob) => {
      if (job) throw { code: 409 };
      job = structuredClone(value);
    }),
    replaceCronJob: vi.fn(async (_name: string, value: V1CronJob) => { job = structuredClone(value); }),
    watch: vi.fn(async (_path, _params, event, done) => {
      const abort = new AbortController();
      abort.signal.addEventListener("abort", () => done(null));
      callbacks.push({ event, done });
      return abort;
    }) as BackupClient["watch"],
  } satisfies BackupClient;
  return { client, callbacks, getJob: () => job, setJob: (value: V1CronJob | undefined) => { job = value; } };
}

afterEach(() => vi.restoreAllMocks());

const shell = process.platform === "win32"
  ? join(process.env.ProgramFiles ?? "C:\\Program Files", "Git", "bin", "bash.exe")
  : "/bin/sh";

describe.skipIf(!existsSync(shell))("backup container command", () => {
  it.each(["success", "dump", "rename"])("handles %s", async (stage) => {
    const fake = fakeClient();
    await reconcile(fake.client, "nightly");
    const container = fake.getJob()!.spec!.jobTemplate.spec!.template.spec!.containers[0]!;
    const dir = mkdtempSync(join(tmpdir(), "backup-controller-test-"));
    const shellDir = process.platform === "win32"
      ? dir.replace(/\\/g, "/").replace(/^([A-Za-z]):/, (_, drive: string) => `/${drive.toLowerCase()}`)
      : dir;
    try {
      expect(container.args![0]).toContain('file="/backups/');
      const script = container.args![0]!.replace('file="/backups/', 'file="$BACKUP_TEST_DIR/');
      const stubs =
        'pg_dump() { [ "$1" = "-Fc" ] && [ "$2" = "-f" ] || return 9; ' +
        'printf dump > "$3"; [ "$FAIL_STAGE" != dump ]; }; ' +
        'mv() { if [ "$FAIL_STAGE" = rename ]; then return 8; fi; command mv "$@"; }; ';
      const result = spawnSync(shell, [container.command![1]!, stubs + script], {
        encoding: "utf8",
        env: { ...process.env, HOSTNAME: "test-pod", BACKUP_TEST_DIR: shellDir, FAIL_STAGE: stage },
      });
      expect(result.error).toBeUndefined();
      const files = readdirSync(dir);
      if (stage === "success") {
        expect(result.status).toBe(0);
        expect(files).toHaveLength(1);
        expect(files[0]).toMatch(/^\d{8}T\d{6}Z-test-pod\.dump$/);
        expect(result.stdout.trim()).toBe(`Backup created: ${shellDir}/${files[0]}`);
        expect(readFileSync(join(dir, files[0]!), "utf8")).toBe("dump");
      } else {
        expect(result.status).not.toBe(0);
        expect(result.stdout).not.toContain("Backup created:");
        expect(files).toEqual([]);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("DatabaseBackup reconciliation", () => {
  it("uses the requested schedule, time zone, Secret and PVC", async () => {
    const fake = fakeClient();
    fake.client.get.mockImplementationOnce(async () => ({
      ...backup,
      spec: {
        ...backup.spec, schedule: "30 4 * * *", timeZone: "Europe/Kyiv",
        connectionSecretName: "other-secret", backupPVCName: "other-pvc",
      },
    }));
    await reconcile(fake.client, "nightly");
    expect(fake.getJob()).toMatchObject({
      spec: {
        schedule: "30 4 * * *", timeZone: "Europe/Kyiv", concurrencyPolicy: "Forbid",
        jobTemplate: { spec: { template: { spec: {
          containers: [{
            image: "postgres:17", envFrom: [{ secretRef: { name: "other-secret" } }],
            volumeMounts: [{ name: "backups", mountPath: "/backups" }],
          }],
          volumes: [{ name: "backups", persistentVolumeClaim: { claimName: "other-pvc" } }],
        } } } },
      },
    });
  });

  it("creates an owned CronJob and leaves unchanged, defaulted fields alone", async () => {
    const fake = fakeClient();
    await reconcile(fake.client, "nightly");
    const job = fake.getJob()!;
    expect(job.metadata?.ownerReferences).toEqual([{
      apiVersion: "backup.example.com/v1alpha1", kind: "DatabaseBackup",
      name: "nightly", uid: "uid-1", controller: true, blockOwnerDeletion: false,
    }]);
    expect(job.spec).toMatchObject({
      schedule: "0 2 * * *", timeZone: "Etc/UTC", concurrencyPolicy: "Forbid",
      jobTemplate: { spec: { template: { spec: {
        containers: [{ envFrom: [{ secretRef: { name: "db-secret" } }] }],
        volumes: [{ persistentVolumeClaim: { claimName: "backups" } }],
      } } } },
    });
    job.spec!.successfulJobsHistoryLimit = 3;
    job.spec!.jobTemplate.spec!.template.spec!.containers[0]!.imagePullPolicy = "IfNotPresent";
    await reconcile(fake.client, "nightly");
    expect(fake.client.createCronJob).toHaveBeenCalledOnce();
    expect(fake.client.replaceCronJob).not.toHaveBeenCalled();
  });

  it("repairs managed fields while preserving unrelated fields and resourceVersion", async () => {
    const fake = fakeClient();
    await reconcile(fake.client, "nightly");
    const job = fake.getJob()!;
    job.metadata!.resourceVersion = "42";
    job.spec!.schedule = "1 1 * * *";
    job.spec!.jobTemplate.spec!.template.spec!.volumes![0]!.persistentVolumeClaim!.claimName = "other";
    job.spec!.successfulJobsHistoryLimit = 5;
    await reconcile(fake.client, "nightly");
    expect(fake.getJob()).toMatchObject({
      metadata: { resourceVersion: "42" },
      spec: { schedule: "0 2 * * *", successfulJobsHistoryLimit: 5,
        jobTemplate: { spec: { template: { spec: { volumes: [{ persistentVolumeClaim: { claimName: "backups" } }] } } } } },
    });
    expect(fake.client.replaceCronJob).toHaveBeenCalledOnce();
  });

  it("does not adopt an unrelated CronJob, including one owned by an older UID", async () => {
    const fake = fakeClient();
    await reconcile(fake.client, "nightly");
    fake.getJob()!.metadata!.ownerReferences![0]!.uid = "old-uid";
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await reconcile(fake.client, "nightly");
    expect(fake.client.replaceCronJob).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("conflicts"));
  });

  it("ignores deleted resources and tolerates a concurrent create", async () => {
    const fake = fakeClient();
    fake.client.get.mockRejectedValueOnce({ code: 404 });
    await reconcile(fake.client, "nightly");
    expect(fake.client.createCronJob).not.toHaveBeenCalled();
    fake.client.createCronJob.mockRejectedValueOnce({ code: 409 });
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    await reconcile(fake.client, "nightly");
    expect(log).toHaveBeenCalled();
  });

  it("reports a competing CronJob created between read and create", async () => {
    const fake = fakeClient();
    fake.client.createCronJob.mockImplementationOnce(async (job) => {
      fake.setJob({ ...job, metadata: { ...job.metadata, ownerReferences: [] } });
      throw { code: 409 };
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await reconcile(fake.client, "nightly");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("conflicts"));
    expect(fake.client.replaceCronJob).not.toHaveBeenCalled();
  });

  it("sends the desired CronJob through the Kubernetes client API", async () => {
    let created: unknown;
    const server = createServer((request, response) => {
      response.setHeader("Content-Type", "application/json");
      if (request.method === "GET") {
        response.writeHead(404).end(JSON.stringify({ kind: "Status", code: 404, message: "not found" }));
      } else {
        const chunks: Buffer[] = [];
        request.on("data", (chunk: Buffer) => chunks.push(chunk));
        request.on("end", () => {
          created = JSON.parse(Buffer.concat(chunks).toString());
          response.writeHead(201).end(JSON.stringify(created));
        });
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const config = new KubeConfig();
      config.loadFromClusterAndUser(
        { name: "test", server: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, skipTLSVerify: true },
        { name: "test" },
      );
      const batch = config.makeApiClient(BatchV1Api);
      const fake = fakeClient();
      const client: BackupClient = {
        ...fake.client,
        readCronJob: (name) => batch.readNamespacedCronJob({ name, namespace: "demo" }),
        createCronJob: (body) => batch.createNamespacedCronJob({ namespace: "demo", body }),
      };
      await reconcile(client, "nightly");
      expect(created).toMatchObject({
        apiVersion: "batch/v1",
        metadata: { name: "nightly", namespace: "demo", ownerReferences: [{ uid: "uid-1" }] },
        spec: { jobTemplate: { spec: { template: { spec: {
          containers: [{ envFrom: [{ secretRef: { name: "db-secret" } }] }],
          volumes: [{ persistentVolumeClaim: { claimName: "backups" } }],
        } } } } },
      });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});

describe("DatabaseBackup watch", () => {
  it("lists at startup, resumes at the last event version and relists after 410", async () => {
    const fake = fakeClient();
    fake.client.list.mockResolvedValueOnce({ metadata: { resourceVersion: "10" }, items: [backup] })
      .mockResolvedValueOnce({ metadata: { resourceVersion: "30" }, items: [backup] });
    const controller = new BackupController(fake.client, 60_000);
    const run = controller.run();
    await vi.waitFor(() => expect(fake.callbacks).toHaveLength(1));
    expect(vi.mocked(fake.client.watch).mock.calls[0]![1].resourceVersion).toBe("10");
    fake.callbacks[0]!.event("MODIFIED", { metadata: { name: "nightly", resourceVersion: "11" } });
    fake.callbacks[0]!.event("MODIFIED", { metadata: { name: "nightly", resourceVersion: "12" } });
    fake.callbacks[0]!.done(null);
    await vi.waitFor(() => expect(fake.callbacks).toHaveLength(2), { timeout: 3000 });
    expect(vi.mocked(fake.client.watch).mock.calls[1]![1].resourceVersion).toBe("12");
    fake.callbacks[1]!.event("ERROR", { code: 410 });
    await vi.waitFor(() => expect(fake.callbacks).toHaveLength(3));
    expect(vi.mocked(fake.client.watch).mock.calls[2]![1].resourceVersion).toBe("30");
    expect(fake.client.createCronJob).toHaveBeenCalledOnce();
    controller.stop();
    await run;
  });

  it("recreates a deleted CronJob during periodic reconciliation", async () => {
    const fake = fakeClient();
    const controller = new BackupController(fake.client, 30);
    const run = controller.run();
    await vi.waitFor(() => expect(fake.client.createCronJob).toHaveBeenCalledTimes(1));
    fake.setJob(undefined);
    await vi.waitFor(() => expect(fake.client.createCronJob).toHaveBeenCalledTimes(2));
    controller.stop();
    await run;
  });

  it("relists when the watch connection itself returns 410", async () => {
    const fake = fakeClient();
    fake.client.list.mockResolvedValueOnce({ metadata: { resourceVersion: "10" }, items: [backup] })
      .mockResolvedValueOnce({ metadata: { resourceVersion: "20" }, items: [backup] });
    const controller = new BackupController(fake.client, 60_000);
    const run = controller.run();
    await vi.waitFor(() => expect(fake.callbacks).toHaveLength(1));
    fake.callbacks[0]!.done({ statusCode: 410 });
    await vi.waitFor(() => expect(fake.callbacks).toHaveLength(2));
    expect(vi.mocked(fake.client.watch).mock.calls[1]![1].resourceVersion).toBe("20");
    controller.stop();
    await run;
  });
});
