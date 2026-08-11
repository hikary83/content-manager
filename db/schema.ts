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

export const shortsProjects = sqliteTable(
  "shorts_projects",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    productName: text("product_name").notNull(),
    status: text("status").notNull().default("draft"),
    dataJson: text("data_json").notNull(),
    coupangUrl: text("coupang_url"),
    infoqUrl: text("infoq_url"),
    publishUrl: text("publish_url"),
    publishedAt: integer("published_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("idx_shorts_projects_user_updated").on(table.userId, table.updatedAt)],
);

export const projectAssets = sqliteTable(
  "project_assets",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    userId: text("user_id").notNull(),
    kind: text("kind").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    objectKey: text("object_key").notNull().unique(),
    size: integer("size").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_project_assets_project").on(table.projectId),
    index("idx_project_assets_user_created").on(table.userId, table.createdAt),
  ],
);
