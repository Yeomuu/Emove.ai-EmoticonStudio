import { neon } from "@neondatabase/serverless";

type LibraryRecord = {
  id: string;
  kind: string;
  payload: unknown;
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
