import { env } from "cloudflare:workers";

export type CoupangCredentials = {
  accessKey: string;
  secretKey: string;
  subId?: string;
};

type RuntimeEnv = {
  DB?: D1Database;
  SETTINGS_ENCRYPTION_KEY?: string;
};

let schemaReady: Promise<void> | null = null;

function runtimeEnv() {
  return env as unknown as RuntimeEnv;
}

function database() {
  const db = runtimeEnv().DB;
  if (!db) throw new Error("상품 설정 저장소가 아직 준비되지 않았어요.");
  return db;
}

async function ensureSchema() {
  if (!schemaReady) {
    const db = database();
    schemaReady = db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS coupang_credentials (
        user_id TEXT PRIMARY KEY NOT NULL,
        credentials_ciphertext TEXT NOT NULL,
        credentials_iv TEXT NOT NULL,
        access_key_hint TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS coupang_product_cache (
        user_id TEXT NOT NULL,
        cache_key TEXT NOT NULL,
        payload TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, cache_key)
      )`),
    ]).then(() => undefined);
  }
  return schemaReady;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + padding);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function encryptionKey() {
  const encoded = runtimeEnv().SETTINGS_ENCRYPTION_KEY;
  if (!encoded) throw new Error("보안 저장소 키가 아직 설정되지 않았어요.");
  const raw = base64UrlToBytes(encoded);
  if (raw.byteLength !== 32) throw new Error("보안 저장소 키 구성이 올바르지 않아요.");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptCredentials(userId: string, credentials: CoupangCredentials) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(credentials));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(userId) },
    await encryptionKey(),
    encoded,
  );
  return {
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
    iv: bytesToBase64Url(iv),
  };
}

async function decryptCredentials(userId: string, ciphertext: string, iv: string) {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64UrlToBytes(iv),
      additionalData: new TextEncoder().encode(userId),
    },
    await encryptionKey(),
    base64UrlToBytes(ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as CoupangCredentials;
}

export async function saveCoupangCredentials(userId: string, credentials: CoupangCredentials) {
  await ensureSchema();
  const encrypted = await encryptCredentials(userId, credentials);
  const hint = credentials.accessKey.slice(-4).padStart(4, "•");
  const now = Date.now();

  await database()
    .prepare(`INSERT INTO coupang_credentials
      (user_id, credentials_ciphertext, credentials_iv, access_key_hint, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        credentials_ciphertext = excluded.credentials_ciphertext,
        credentials_iv = excluded.credentials_iv,
        access_key_hint = excluded.access_key_hint,
        updated_at = excluded.updated_at`)
    .bind(userId, encrypted.ciphertext, encrypted.iv, hint, now)
    .run();

  await database().prepare("DELETE FROM coupang_product_cache WHERE user_id = ?").bind(userId).run();
  return { accessKeyHint: hint, updatedAt: now };
}

export async function getCoupangCredentials(userId: string) {
  await ensureSchema();
  const row = await database()
    .prepare("SELECT credentials_ciphertext, credentials_iv FROM coupang_credentials WHERE user_id = ?")
    .bind(userId)
    .first<{ credentials_ciphertext: string; credentials_iv: string }>();
  if (!row) return null;
  return decryptCredentials(userId, row.credentials_ciphertext, row.credentials_iv);
}

export async function getCoupangSettingsStatus(userId: string) {
  await ensureSchema();
  const row = await database()
    .prepare("SELECT access_key_hint, updated_at FROM coupang_credentials WHERE user_id = ?")
    .bind(userId)
    .first<{ access_key_hint: string; updated_at: number }>();
  return row
    ? { configured: true, accessKeyHint: row.access_key_hint, updatedAt: row.updated_at }
    : { configured: false, accessKeyHint: null, updatedAt: null };
}

export async function deleteCoupangCredentials(userId: string) {
  await ensureSchema();
  await database().batch([
    database().prepare("DELETE FROM coupang_credentials WHERE user_id = ?").bind(userId),
    database().prepare("DELETE FROM coupang_product_cache WHERE user_id = ?").bind(userId),
  ]);
}

export async function readProductCache<T>(userId: string, cacheKey: string): Promise<T | null> {
  await ensureSchema();
  const row = await database()
    .prepare("SELECT payload, expires_at FROM coupang_product_cache WHERE user_id = ? AND cache_key = ?")
    .bind(userId, cacheKey)
    .first<{ payload: string; expires_at: number }>();
  if (!row || row.expires_at <= Date.now()) return null;
  try {
    return JSON.parse(row.payload) as T;
  } catch {
    return null;
  }
}

export async function writeProductCache(
  userId: string,
  cacheKey: string,
  payload: unknown,
  ttlMilliseconds: number,
) {
  await ensureSchema();
  const now = Date.now();
  await database()
    .prepare(`INSERT INTO coupang_product_cache
      (user_id, cache_key, payload, expires_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, cache_key) DO UPDATE SET
        payload = excluded.payload,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at`)
    .bind(userId, cacheKey, JSON.stringify(payload), now + ttlMilliseconds, now)
    .run();
}
