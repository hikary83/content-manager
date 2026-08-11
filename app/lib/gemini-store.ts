import { env } from "cloudflare:workers";

export type GeminiCredentials = {
  apiKey: string;
};

export type VideoJobStatus = "generating" | "starting_extension" | "extending" | "complete" | "failed";

export type VideoJob = {
  id: string;
  userId: string;
  status: VideoJobStatus;
  operationName: string;
  model: string;
  productName: string;
  firstPrompt: string;
  extensionPrompt: string;
  baseVideoUri: string | null;
  videoUri: string | null;
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
  expiresAt: number | null;
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
  if (!db) throw new Error("영상 설정 저장소가 아직 준비되지 않았어요.");
  return db;
}

async function ensureSchema() {
  if (!schemaReady) {
    const db = database();
    schemaReady = db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS gemini_credentials (
        user_id TEXT PRIMARY KEY NOT NULL,
        credentials_ciphertext TEXT NOT NULL,
        credentials_iv TEXT NOT NULL,
        api_key_hint TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS video_jobs (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL,
        operation_name TEXT NOT NULL,
        model TEXT NOT NULL,
        product_name TEXT NOT NULL,
        first_prompt TEXT NOT NULL,
        extension_prompt TEXT NOT NULL,
        base_video_uri TEXT,
        video_uri TEXT,
        error_message TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        expires_at INTEGER
      )`),
      db.prepare("CREATE INDEX IF NOT EXISTS video_jobs_user_created_idx ON video_jobs (user_id, created_at)"),
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

async function encryptCredentials(userId: string, credentials: GeminiCredentials) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(`gemini:${userId}`) },
    await encryptionKey(),
    new TextEncoder().encode(JSON.stringify(credentials)),
  );
  return { ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)), iv: bytesToBase64Url(iv) };
}

async function decryptCredentials(userId: string, ciphertext: string, iv: string) {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64UrlToBytes(iv),
      additionalData: new TextEncoder().encode(`gemini:${userId}`),
    },
    await encryptionKey(),
    base64UrlToBytes(ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as GeminiCredentials;
}

export async function saveGeminiCredentials(userId: string, credentials: GeminiCredentials) {
  await ensureSchema();
  const encrypted = await encryptCredentials(userId, credentials);
  const hint = credentials.apiKey.slice(-4).padStart(4, "•");
  const now = Date.now();
  await database().prepare(`INSERT INTO gemini_credentials
    (user_id, credentials_ciphertext, credentials_iv, api_key_hint, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      credentials_ciphertext = excluded.credentials_ciphertext,
      credentials_iv = excluded.credentials_iv,
      api_key_hint = excluded.api_key_hint,
      updated_at = excluded.updated_at`)
    .bind(userId, encrypted.ciphertext, encrypted.iv, hint, now)
    .run();
  return { apiKeyHint: hint, updatedAt: now };
}

export async function getGeminiCredentials(userId: string) {
  await ensureSchema();
  const row = await database().prepare(
    "SELECT credentials_ciphertext, credentials_iv FROM gemini_credentials WHERE user_id = ?",
  ).bind(userId).first<{ credentials_ciphertext: string; credentials_iv: string }>();
  if (!row) return null;
  return decryptCredentials(userId, row.credentials_ciphertext, row.credentials_iv);
}

export async function getGeminiSettingsStatus(userId: string) {
  await ensureSchema();
  const row = await database().prepare(
    "SELECT api_key_hint, updated_at FROM gemini_credentials WHERE user_id = ?",
  ).bind(userId).first<{ api_key_hint: string; updated_at: number }>();
  return row
    ? { configured: true, apiKeyHint: row.api_key_hint, updatedAt: row.updated_at }
    : { configured: false, apiKeyHint: null, updatedAt: null };
}

export async function deleteGeminiCredentials(userId: string) {
  await ensureSchema();
  await database().prepare("DELETE FROM gemini_credentials WHERE user_id = ?").bind(userId).run();
}

function mapVideoJob(row: Record<string, unknown>): VideoJob {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    status: String(row.status) as VideoJobStatus,
    operationName: String(row.operation_name),
    model: String(row.model),
    productName: String(row.product_name),
    firstPrompt: String(row.first_prompt),
    extensionPrompt: String(row.extension_prompt),
    baseVideoUri: row.base_video_uri ? String(row.base_video_uri) : null,
    videoUri: row.video_uri ? String(row.video_uri) : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    expiresAt: row.expires_at ? Number(row.expires_at) : null,
  };
}

export async function createVideoJob(input: Omit<VideoJob, "baseVideoUri" | "videoUri" | "errorMessage" | "expiresAt">) {
  await ensureSchema();
  await database().prepare(`INSERT INTO video_jobs
    (id, user_id, status, operation_name, model, product_name, first_prompt, extension_prompt, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      input.id,
      input.userId,
      input.status,
      input.operationName,
      input.model,
      input.productName,
      input.firstPrompt,
      input.extensionPrompt,
      input.createdAt,
      input.updatedAt,
    ).run();
}

export async function getVideoJob(userId: string, jobId: string) {
  await ensureSchema();
  const row = await database().prepare("SELECT * FROM video_jobs WHERE id = ? AND user_id = ?")
    .bind(jobId, userId).first<Record<string, unknown>>();
  return row ? mapVideoJob(row) : null;
}

export async function claimVideoExtension(userId: string, jobId: string, baseVideoUri: string) {
  await ensureSchema();
  const result = await database().prepare(`UPDATE video_jobs
    SET status = 'starting_extension', base_video_uri = ?, updated_at = ?
    WHERE id = ? AND user_id = ? AND status = 'generating'`)
    .bind(baseVideoUri, Date.now(), jobId, userId).run();
  return Number(result.meta.changes ?? 0) > 0;
}

export async function setVideoJobExtending(userId: string, jobId: string, operationName: string) {
  await ensureSchema();
  await database().prepare(`UPDATE video_jobs
    SET status = 'extending', operation_name = ?, updated_at = ?
    WHERE id = ? AND user_id = ?`)
    .bind(operationName, Date.now(), jobId, userId).run();
}

export async function completeVideoJob(userId: string, jobId: string, videoUri: string) {
  await ensureSchema();
  const now = Date.now();
  await database().prepare(`UPDATE video_jobs
    SET status = 'complete', video_uri = ?, error_message = NULL, updated_at = ?, expires_at = ?
    WHERE id = ? AND user_id = ?`)
    .bind(videoUri, now, now + 2 * 24 * 60 * 60 * 1000, jobId, userId).run();
}

export async function failVideoJob(userId: string, jobId: string, message: string) {
  await ensureSchema();
  await database().prepare(`UPDATE video_jobs
    SET status = 'failed', error_message = ?, updated_at = ?
    WHERE id = ? AND user_id = ?`)
    .bind(message.slice(0, 500), Date.now(), jobId, userId).run();
}
