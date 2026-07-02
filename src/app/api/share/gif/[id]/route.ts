import { sharedGifMemoryStore } from "../../../../../../server/share-memory";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const entry = sharedGifMemoryStore().get(id);
  if (!entry) {
    return new Response(JSON.stringify({ error: "공유 GIF를 찾지 못했습니다." }), {
      status: 404,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  return new Response(entry.data, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `inline; filename="${entry.fileName}"`,
      "Content-Type": "image/gif",
    },
  });
}
