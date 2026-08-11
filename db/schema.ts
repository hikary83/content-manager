import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const coupangCredentials = sqliteTable("coupang_credentials", {
  userId: text("user_id").primaryKey(),
  credentialsCiphertext: text("credentials_ciphertext").notNull(),
  credentialsIv: text("credentials_iv").notNull(),
  accessKeyHint: text("access_key_hint").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const coupangProductCache = sqliteTable(
  "coupang_product_cache",
  {
    userId: text("user_id").notNull(),
    cacheKey: text("cache_key").notNull(),
    payload: text("payload").notNull(),
    expiresAt: integer("expires_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.cacheKey] })],
);

export const geminiCredentials = sqliteTable("gemini_credentials", {
  userId: text("user_id").primaryKey(),
  credentialsCiphertext: text("credentials_ciphertext").notNull(),
  credentialsIv: text("credentials_iv").notNull(),
  apiKeyHint: text("api_key_hint").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const videoJobs = sqliteTable(
  "video_jobs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    status: text("status").notNull(),
    operationName: text("operation_name").notNull(),
    model: text("model").notNull(),
    productName: text("product_name").notNull(),
    firstPrompt: text("first_prompt").notNull(),
    extensionPrompt: text("extension_prompt").notNull(),
    baseVideoUri: text("base_video_uri"),
    videoUri: text("video_uri"),
    errorMessage: text("error_message"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    expiresAt: integer("expires_at"),
  },
  (table) => [index("video_jobs_user_created_idx").on(table.userId, table.createdAt)],
);
