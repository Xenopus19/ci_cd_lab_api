import { BatchV1Api, CustomObjectsApi, KubeConfig, Watch } from "@kubernetes/client-node";
import { BackupController } from "./backup-controller";

const config = new KubeConfig();
config.loadFromDefault();
const custom = config.makeApiClient(CustomObjectsApi);
const batch = config.makeApiClient(BatchV1Api);
const watch = new Watch(config);
const controller = new BackupController({
  list: () => custom.listNamespacedCustomObject({
    group: "backup.example.com", version: "v1alpha1", namespace: "demo", plural: "databasebackups",
  }),
  get: (name) => custom.getNamespacedCustomObject({
    group: "backup.example.com", version: "v1alpha1", namespace: "demo", plural: "databasebackups", name,
  }),
  readCronJob: (name) => batch.readNamespacedCronJob({ name, namespace: "demo" }),
  createCronJob: (body) => batch.createNamespacedCronJob({ namespace: "demo", body }),
  replaceCronJob: (name, body) => batch.replaceNamespacedCronJob({ name, namespace: "demo", body }),
  watch: (path, params, event, done) => watch.watch(path, params, event, done),
});

process.on("SIGTERM", () => controller.stop());
process.on("SIGINT", () => controller.stop());
void controller.run().catch((error: unknown) => {
  console.error("DatabaseBackup controller stopped unexpectedly", error);
  process.exitCode = 1;
});
