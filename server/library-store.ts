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

type LibraryRow = {
  id: unknown;
  kind: unknown;
  payload: unknown;
  created_at: unknown;
  updated_at: unknown;
};

let sqlClient: ReturnType<typeof neon> | null = null;
let schemaReady: Promise<void> | null = null;

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
    on conflict (kind, id) do update set
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
  ` as LibraryRow[];
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
  schemaReady ??= (async () => {
    await sql`
      create table if not exists emove_library_records (
        id text not null,
        kind text not null,
        payload jsonb not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
    // Older EMOVE tables used id alone as the primary key, which allowed
    // project/sticker records with the same id to overwrite one another.
    await sql`alter table emove_library_records drop constraint if exists emove_library_records_pkey`;
    await sql`create unique index if not exists emove_library_records_kind_id_idx on emove_library_records (kind, id)`;
  })();
  try {
    await schemaReady;
  } catch (error) {
    schemaReady = null;
    throw error;
  }
}

function toIsoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return new Date(value).toISOString();
  return new Date().toISOString();
}
