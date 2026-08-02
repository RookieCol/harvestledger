import * as Joi from 'joi';

/**
 * Fail-fast validation for the shared environment. Applied via
 * `ConfigModule.forRoot({ validationSchema: envValidationSchema })` so a service
 * refuses to boot with a missing/blank core variable instead of failing later
 * at the first query or message. `.unknown(true)` keeps feature-specific vars
 * (MAIL_*, ADMIN_*, PGADMIN_*, …) from tripping the check.
 */
export const envValidationSchema = Joi.object({
  // Messaging
  RABBITMQ_USER: Joi.string().required(),
  RABBITMQ_PASS: Joi.string().required(),
  RABBITMQ_HOST: Joi.string().required(),
  RABBITMQ_AUTH_QUEUE: Joi.string().required(),
  RABBITMQ_FARMS_QUEUE: Joi.string().required(),
  RABBITMQ_TRACING_QUEUE: Joi.string().required(),

  // Datastores.
  // The two Postgres connection strings are optional *here* on purpose: since
  // the database-per-service split each URI belongs to exactly one service, and
  // this schema is shared (the gateway applies it, and the gateway owns no
  // database). Requiring them globally would force every service to carry
  // credentials for a database it must never touch. The fail-fast guarantee is
  // not lost — it moved to where the ownership is: PostgresDBModule.forApp()
  // refuses to boot if its own URI is missing.
  AUTH_POSTGRES_URI: Joi.string().optional(),
  FARMS_POSTGRES_URI: Joi.string().optional(),
  MONGO_URI: Joi.string().required(),
  REDIS_URL: Joi.string().uri().required(),
  DB_RUN_MIGRATIONS: Joi.string().valid('true', 'false').optional(),

  // Auth
  JWT_SECRET: Joi.string().required(),
  JWT_REFRESH_SECRET: Joi.string().required(),

  // Object storage
  S3_REGION: Joi.string().required(),
  S3_BUCKET: Joi.string().required(),
  S3_ACCESS_KEY_ID: Joi.string().allow('').optional(),
  S3_SECRET_ACCESS_KEY: Joi.string().allow('').optional(),
  S3_ENDPOINT: Joi.string().uri().optional(),

  // Gateway
  CORS_ORIGINS: Joi.string().optional(),

  // Logging
  LOG_LEVEL: Joi.string()
    .valid('trace', 'debug', 'info', 'warn', 'error', 'fatal')
    .optional(),
}).unknown(true);
