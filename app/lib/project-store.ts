import { env } from "cloudflare:workers";

type RuntimeEnv = {
  DB?: D1Database;
  MEDIA?: R2Bucket;
};

export type ProjectStatus = "draft" | "planning" | "producing" | "editing" | "ready" | "published";

export type ProjectInput = {
  title: string;
  productName: string;
  status: ProjectStatus;
  data: Record<string, unknown>;
  coupangUrl?: string;
  infoqUrl?: string;
  publishUrl?: string;
  publishedAt?: number | null;
};

export type ProjectRecord = ProjectInput & {
  id: string;
  createdAt: number;
  updatedAt: number;
  assetCount: number;
};

export type ProjectAsset = {
  id: string;
  projectId: string;
  kind: string;
  fileName: string;
  contentType: string;
  objectKey: string;
  size: number;
  createdAt: number;
};

let schemaReady: Promise<void> | null = null;

function runtimeEnv() {
  return env as unknown as RuntimeEnv;
}

function database() {
  const db = runtimeEnv().DB;
  if (!db) throw new Error("프로젝트 저장소가 아직 준비되지 않았어요.");
  return db;
}

export function mediaBucket() {
  const bucket = runtimeEnv().MEDIA;
  if (!bucket) throw new Error("파일 저장소가 아직 준비되지 않았어요.");
  return bucket;
}

export async function ensureProjectSchema() {
  if (!schemaReady) {
    const db = database();
    schemaReady = db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS shorts_projects (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        product_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        data_json TEXT NOT NULL,
        coupang_url TEXT,
        infoq_url TEXT,
        publish_url TEXT,
        published_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_shorts_projects_user_updated ON shorts_projects (user_id, updated_at)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS project_assets (
        id TEXT PRIMARY KEY NOT NULL,
        project_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        file_name TEXT NOT NULL,
        content_type TEXT NOT NULL,
        object_key TEXT NOT NULL UNIQUE,
        size INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      )`),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_project_assets_project ON project_assets (project_id)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_project_assets_user_created ON project_assets (user_id, created_at)"),
    ]).then(() => undefined);
  }
  return schemaReady;
}

function safeJson(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function rowToProject(row: Record<string, unknown>): ProjectRecord {
  return {
    id: String(row.id),
    title: String(row.title),
    productName: String(row.product_name),
    status: String(row.status) as ProjectStatus,
    data: safeJson(String(row.data_json)),
    coupangUrl: row.coupang_url ? String(row.coupang_url) : "",
    infoqUrl: row.infoq_url ? String(row.infoq_url) : "",
    publishUrl: row.publish_url ? String(row.publish_url) : "",
    publishedAt: row.published_at == null ? null : Number(row.published_at),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    assetCount: Number(row.asset_count ?? 0),
  };
}

export async function listProjects(userId: string) {
  await ensureProjectSchema();
  const result = await database().prepare(`SELECT p.*,
    (SELECT COUNT(*) FROM project_assets a WHERE a.project_id = p.id AND a.user_id = p.user_id) AS asset_count
    FROM shorts_projects p WHERE p.user_id = ? ORDER BY p.updated_at DESC LIMIT 100`).bind(userId).all<Record<string, unknown>>();
  return (result.results ?? []).map(rowToProject);
}

export async function getProject(userId: string, projectId: string) {
  await ensureProjectSchema();
  const row = await database().prepare(`SELECT p.*,
    (SELECT COUNT(*) FROM project_assets a WHERE a.project_id = p.id AND a.user_id = p.user_id) AS asset_count
    FROM shorts_projects p WHERE p.user_id = ? AND p.id = ?`).bind(userId, projectId).first<Record<string, unknown>>();
  return row ? rowToProject(row) : null;
}

export async function createProject(userId: string, input: ProjectInput) {
  await ensureProjectSchema();
  const id = crypto.randomUUID();
  const now = Date.now();
  await database().prepare(`INSERT INTO shorts_projects
    (id, user_id, title, product_name, status, data_json, coupang_url, infoq_url, publish_url, published_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      id, userId, input.title, input.productName, input.status, JSON.stringify(input.data),
      input.coupangUrl || null, input.infoqUrl || null, input.publishUrl || null,
      input.publishedAt ?? null, now, now,
    ).run();
  return getProject(userId, id);
}

export async function updateProject(userId: string, projectId: string, input: ProjectInput) {
  await ensureProjectSchema();
  const existing = await getProject(userId, projectId);
  if (!existing) return null;
  const now = Date.now();
  await database().prepare(`UPDATE shorts_projects SET
    title = ?, product_name = ?, status = ?, data_json = ?, coupang_url = ?, infoq_url = ?, publish_url = ?, published_at = ?, updated_at = ?
    WHERE id = ? AND user_id = ?`).bind(
      input.title, input.productName, input.status, JSON.stringify(input.data), input.coupangUrl || null,
      input.infoqUrl || null, input.publishUrl || null, input.publishedAt ?? null, now, projectId, userId,
    ).run();
  return getProject(userId, projectId);
}

export async function listProjectAssets(userId: string, projectId: string) {
  await ensureProjectSchema();
  const result = await database().prepare(`SELECT id, project_id, kind, file_name, content_type, object_key, size, created_at
    FROM project_assets WHERE user_id = ? AND project_id = ? ORDER BY created_at ASC`).bind(userId, projectId).all<Record<string, unknown>>();
  return (result.results ?? []).map((row): ProjectAsset => ({
    id: String(row.id),
    projectId: String(row.project_id),
    kind: String(row.kind),
    fileName: String(row.file_name),
    contentType: String(row.content_type),
    objectKey: String(row.object_key),
    size: Number(row.size),
    createdAt: Number(row.created_at),
  }));
}

export async function addProjectAsset(userId: string, projectId: string, asset: Omit<ProjectAsset, "projectId" | "createdAt">) {
  await ensureProjectSchema();
  if (!await getProject(userId, projectId)) return null;
  const createdAt = Date.now();
  await database().prepare(`INSERT INTO project_assets
    (id, project_id, user_id, kind, file_name, content_type, object_key, size, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      asset.id, projectId, userId, asset.kind, asset.fileName, asset.contentType, asset.objectKey, asset.size, createdAt,
    ).run();
  return { ...asset, projectId, createdAt };
}

export async function getProjectAsset(userId: string, projectId: string, assetId: string) {
  await ensureProjectSchema();
  const row = await database().prepare(`SELECT id, project_id, kind, file_name, content_type, object_key, size, created_at
    FROM project_assets WHERE user_id = ? AND project_id = ? AND id = ?`).bind(userId, projectId, assetId).first<Record<string, unknown>>();
  if (!row) return null;
  return {
    id: String(row.id), projectId: String(row.project_id), kind: String(row.kind), fileName: String(row.file_name),
    contentType: String(row.content_type), objectKey: String(row.object_key), size: Number(row.size), createdAt: Number(row.created_at),
  } satisfies ProjectAsset;
}

export async function deleteProjectAsset(userId: string, projectId: string, assetId: string) {
  const asset = await getProjectAsset(userId, projectId, assetId);
  if (!asset) return null;
  await mediaBucket().delete(asset.objectKey);
  await database().prepare("DELETE FROM project_assets WHERE user_id = ? AND project_id = ? AND id = ?").bind(userId, projectId, assetId).run();
  return asset;
}

export async function deleteProject(userId: string, projectId: string) {
  await ensureProjectSchema();
  const project = await getProject(userId, projectId);
  if (!project) return false;
  const assets = await listProjectAssets(userId, projectId);
  if (assets.length > 0) await mediaBucket().delete(assets.map((asset) => asset.objectKey));
  await database().batch([
    database().prepare("DELETE FROM project_assets WHERE user_id = ? AND project_id = ?").bind(userId, projectId),
    database().prepare("DELETE FROM shorts_projects WHERE user_id = ? AND id = ?").bind(userId, projectId),
  ]);
  return true;
}
