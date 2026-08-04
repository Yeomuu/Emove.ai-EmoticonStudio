import { deleteLibraryRecord, libraryStoreConfigurationError, listLibraryRecords, saveLibraryRecord } from "../../../../../server/library-store";
import { isSameOriginRequest } from "../../../../../server/request-security";

export const runtime = "nodejs";

const allowedKinds = new Set(["characters", "captures", "projects", "stickers"]);

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string }> }): Promise<Response> {
  const { kind } = await params;
  if (!allowedKinds.has(kind)) return json(404, { error: "지원하지 않는 라이브러리 저장소입니다." });

  const result = await listLibraryRecords(kind);
  if (!result.enabled) return json(501, { error: result.error ?? libraryStoreConfigurationError() ?? "Firestore 조회를 사용할 수 없습니다." });
  return json(200, result);
}

export async function POST(request: Request, { params }: { params: Promise<{ kind: string }> }): Promise<Response> {
  const { kind } = await params;
  if (!allowedKinds.has(kind)) return json(404, { error: "지원하지 않는 라이브러리 저장소입니다." });
  if (!isSameOriginRequest(request)) return json(403, { error: "다른 출처에서는 보관함을 수정할 수 없습니다." });
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > 512 * 1024) return json(413, { error: "보관함 메타데이터가 너무 큽니다." });
  const body = await request.json().catch(() => undefined) as { id?: string; payload?: unknown } | undefined;
  if (!body?.id || body.payload == null) return json(400, { error: "저장할 라이브러리 레코드가 비어 있습니다." });

  const result = await saveLibraryRecord({ id: body.id, kind, payload: body.payload });
  if (!result.enabled) return json(501, { error: result.error ?? libraryStoreConfigurationError() ?? "Firestore 저장을 사용할 수 없습니다." });
  return json(201, result);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ kind: string }> }): Promise<Response> {
  const { kind } = await params;
  if (!allowedKinds.has(kind)) return json(404, { error: "지원하지 않는 라이브러리 저장소입니다." });
  if (!isSameOriginRequest(request)) return json(403, { error: "다른 출처에서는 보관함을 수정할 수 없습니다." });
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return json(400, { error: "삭제할 라이브러리 레코드 ID가 필요합니다." });

  const result = await deleteLibraryRecord(kind, id);
  if (!result.enabled) return json(501, { error: result.error ?? libraryStoreConfigurationError() ?? "Firestore 삭제를 사용할 수 없습니다." });
  return json(200, result);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
