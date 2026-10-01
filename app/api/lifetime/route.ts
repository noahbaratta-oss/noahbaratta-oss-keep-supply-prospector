import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { Pool } from "pg";

// Cloud copy of the Lifetime database so it follows the user across browsers/computers.
// Active only when a Postgres database (e.g. Neon via the Vercel integration) is connected
// and APP_PASSCODE is set. Every request must carry the passcode.
//
// GET  ?status=1                       → { configured, database, passcode }   (no passcode needed)
// GET  ?since=<ISO time>&limit=1000    → { records: [{store,key,data,deleted,updatedAt}], more }
// POST { upserts: [{store,key,data}], deletes: [{store,key}] } → { ok, upserted, deleted }

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STORES = new Set(["lifetime", "saved", "meta"]);
const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL || "";
const PASSCODE = process.env.APP_PASSCODE || "";

let pool: Pool | null = null;
let ready: Promise<void> | null = null;

function db(): Pool {
  if (!pool) {
    const local = /localhost|127\.0\.0\.1/.test(DB_URL);
    pool = new Pool({ connectionString: DB_URL, max: 3, idleTimeoutMillis: 10_000, ssl: local ? undefined : { rejectUnauthorized: false } });
  }
  return pool;
}

async function ensureSchema() {
  if (!ready) {
    ready = db().query(`
      create table if not exists ks_records (
        store text not null,
        key text not null,
        data jsonb not null,
        deleted boolean not null default false,
        updated_at timestamptz not null default clock_timestamp(),
        primary key (store, key)
      );
      create index if not exists ks_records_updated_idx on ks_records (updated_at);
    `).then(() => undefined).catch((e) => { ready = null; throw e; });
  }
  return ready;
}

function authorized(req: Request): boolean {
  if (!PASSCODE) return false;
  const got = Buffer.from(req.headers.get("x-app-passcode") || "");
  const want = Buffer.from(PASSCODE);
  return got.length === want.length && timingSafeEqual(got, want);
}

const configured = () => Boolean(DB_URL && PASSCODE);

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("status")) {
    return NextResponse.json({ configured: configured(), database: Boolean(DB_URL), passcode: Boolean(PASSCODE) });
  }
  if (!configured()) return NextResponse.json({ error: "Cloud sync is not configured." }, { status: 501 });
  if (!authorized(req)) return NextResponse.json({ error: "Wrong passcode." }, { status: 401 });
  try {
    await ensureSchema();
    const since = url.searchParams.get("since") || "1970-01-01T00:00:00Z";
    const limit = Math.min(2000, Math.max(1, Number(url.searchParams.get("limit")) || 1000));
    const r = await db().query(
      `select store, key, data, deleted, to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor
       from ks_records where updated_at > $1::timestamptz order by updated_at asc limit $2`,
      [since, limit + 1],
    );
    const rows = r.rows.slice(0, limit);
    return NextResponse.json({
      // Microsecond-precision cursor so paging never repeats or skips rows.
      records: rows.map((x) => ({ store: x.store, key: x.key, data: x.data, deleted: x.deleted, updatedAt: x.cursor })),
      more: r.rows.length > limit,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Database error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!configured()) return NextResponse.json({ error: "Cloud sync is not configured." }, { status: 501 });
  if (!authorized(req)) return NextResponse.json({ error: "Wrong passcode." }, { status: 401 });
  let body: { upserts?: Array<{ store: string; key: string; data: unknown }>; deletes?: Array<{ store: string; key: string }> };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const upserts = (body.upserts || []).filter((u) => u && STORES.has(u.store) && typeof u.key === "string" && u.key.length < 500).slice(0, 1000);
  const deletes = (body.deletes || []).filter((d) => d && STORES.has(d.store) && typeof d.key === "string").slice(0, 1000);
  try {
    await ensureSchema();
    if (upserts.length) {
      await db().query(
        `insert into ks_records (store, key, data, deleted, updated_at)
         select s, k, d::jsonb, false, clock_timestamp() from unnest($1::text[], $2::text[], $3::text[]) as t(s, k, d)
         on conflict (store, key) do update set data = excluded.data, deleted = false, updated_at = clock_timestamp()`,
        [upserts.map((u) => u.store), upserts.map((u) => u.key), upserts.map((u) => JSON.stringify(u.data))],
      );
    }
    if (deletes.length) {
      await db().query(
        `insert into ks_records (store, key, data, deleted, updated_at)
         select s, k, '{}'::jsonb, true, clock_timestamp() from unnest($1::text[], $2::text[]) as t(s, k)
         on conflict (store, key) do update set data = '{}'::jsonb, deleted = true, updated_at = clock_timestamp()`,
        [deletes.map((d) => d.store), deletes.map((d) => d.key)],
      );
    }
    return NextResponse.json({ ok: true, upserted: upserts.length, deleted: deletes.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Database error" }, { status: 500 });
  }
}
