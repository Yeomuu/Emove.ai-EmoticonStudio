import { neon } from "@neondatabase/serverless";

type LibraryRecord = {
  id: string;
  kind: string;
  payload: unknown;
};

type StoredLibraryRecord = LibraryRecord & {
  createdAt: string;
  updatedAt: string;
};

let sqlClient: ReturnType<typeof neon> | null = null;
let schemaReady = false;

function getSql(): ReturnType<typeof neon> | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  sqlClient ??= neon(url);
  return sqlClient;
}

export async function saveLibraryRecord(record: LibraryRecord): Promise<{ enabled: boolean; syncedAt?: string; storagePath?: string }> {
  const sql = getSql();
  if (!sql) return { enabled: false };
  await ensureSchema(sql);
  const syncedAt = new Date().toISOString();
  await sql`
    insert into emove_library_records (id, kind, payload, updated_at)
    values (${record.id}, ${record.kind}, ${JSON.stringify(record.payload)}::jsonb, ${syncedAt})
    on conflict (id) do update set
      kind = excluded.kind,
      payload = excluded.payload,
      updated_at = excluded.updated_at
  `;
  return { enabled: true, syncedAt, storagePath: `neon://emove_library_records/${record.id}` };
}

export async function listLibraryRecords(kind: string): Promise<{ enabled: boolean; records?: StoredLibraryRecord[] }> {
  const sql = getSql();
  if (!sql) return { enabled: false };
  await ensureSchema(sql);
  const rows = await sql`
    select id, kind, payload, created_at, updated_at
    from emove_library_records
    where kind = ${kind}
    order by updated_at desc
    limit 200
  `;
  return {
    enabled: true,
    records: rows.map((row) => ({
      id: String(row.id),
      kind: String(row.kind),
      payload: row.payload,
      createdAt: toIsoString(row.created_at),
      updatedAt: toIsoString(row.updated_at),
    })),
  };
}

async function ensureSchema(sql: ReturnType<typeof neon>): Promise<void> {
  if (schemaReady) return;
  await sql`
    create table if not exists emove_library_records (
      id text primary key,
      kind text not null,
      payload jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  schemaReady = true;
}

function toIsoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return new Date(value).toISOString();
  return new Date().toISOString();
}
