import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  RESOURCE_DEFAULTS_FILE,
  TECH_STACK_FILE
} from "./chunk-73W4Y4TI.js";

// dist/types/index.js
var RESOURCE_CONFIG_APP_TYPES = [
  "backend",
  "frontend",
  "library",
  "sdk",
  "worker",
  "migrator",
  "mcp",
  "agent",
  "database",
  "bring-your-own"
];
var CREATABLE_RESOURCE_TYPES = [
  "backend",
  "frontend",
  "worker",
  "mcp",
  "agent",
  "bring-your-own"
];
var DATABASE_RESOURCE_TYPE = "database";
var DATABASE_FRAMEWORK = "postgres";
var QUEUE_RESOURCE_TYPE = "queue";
var STORAGE_RESOURCE_TYPE = "storage";
var MAIL_RESOURCE_TYPE = "mail";
var PAYMENT_RESOURCE_TYPE = "payment";
var DATABASE_INFRA_FRAMEWORKS = [
  "redis",
  "qdrant",
  "mlflow",
  "mysql",
  "mongodb",
  "clickhouse"
];
var QUEUE_FRAMEWORKS = ["nats", "rabbitmq"];
var DEFAULT_QUEUE_FRAMEWORK = "nats";
var STORAGE_FRAMEWORKS = ["minio"];
var MAIL_FRAMEWORKS = ["mailpit"];
var PAYMENT_FRAMEWORKS = ["stripe-mock"];
var PRESET_RESOURCE_TYPES = {
  [QUEUE_RESOURCE_TYPE]: {
    label: "Queue",
    frameworks: QUEUE_FRAMEWORKS,
    default: DEFAULT_QUEUE_FRAMEWORK
  },
  [STORAGE_RESOURCE_TYPE]: { label: "Storage", frameworks: STORAGE_FRAMEWORKS, default: "minio" },
  [MAIL_RESOURCE_TYPE]: { label: "Mail", frameworks: MAIL_FRAMEWORKS, default: "mailpit" },
  [PAYMENT_RESOURCE_TYPE]: {
    label: "Payment",
    frameworks: PAYMENT_FRAMEWORKS,
    default: "stripe-mock"
  }
};
var DATABASE_FRAMEWORKS = [DATABASE_FRAMEWORK, ...DATABASE_INFRA_FRAMEWORKS];
var RESOURCE_TYPE_VALUES = [
  ...CREATABLE_RESOURCE_TYPES,
  DATABASE_RESOURCE_TYPE,
  QUEUE_RESOURCE_TYPE,
  STORAGE_RESOURCE_TYPE,
  MAIL_RESOURCE_TYPE,
  PAYMENT_RESOURCE_TYPE,
  "sdk"
];
var INFERENCE_RESOURCE_TYPE = "inference";
var RESOURCE_CREATE_TYPE_VALUES = [
  ...CREATABLE_RESOURCE_TYPES,
  INFERENCE_RESOURCE_TYPE,
  DATABASE_RESOURCE_TYPE,
  QUEUE_RESOURCE_TYPE,
  STORAGE_RESOURCE_TYPE,
  MAIL_RESOURCE_TYPE,
  PAYMENT_RESOURCE_TYPE
];
function isMasterConfigFileName(filename) {
  const validNames = [TECH_STACK_FILE, RESOURCE_DEFAULTS_FILE, "spec.master"];
  return validNames.includes(filename);
}

export {
  RESOURCE_CONFIG_APP_TYPES,
  CREATABLE_RESOURCE_TYPES,
  DATABASE_RESOURCE_TYPE,
  DATABASE_FRAMEWORK,
  QUEUE_RESOURCE_TYPE,
  STORAGE_RESOURCE_TYPE,
  MAIL_RESOURCE_TYPE,
  PAYMENT_RESOURCE_TYPE,
  DATABASE_INFRA_FRAMEWORKS,
  PRESET_RESOURCE_TYPES,
  DATABASE_FRAMEWORKS,
  INFERENCE_RESOURCE_TYPE,
  RESOURCE_CREATE_TYPE_VALUES,
  isMasterConfigFileName
};
