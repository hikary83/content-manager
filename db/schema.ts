import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
