export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    if (originUrl.origin === requestUrl.origin) return true;

    const host = firstForwardedValue(request.headers.get("x-forwarded-host"))
      || firstForwardedValue(request.headers.get("host"));
    const protocol = firstForwardedValue(request.headers.get("x-forwarded-proto"))
      || requestUrl.protocol.replace(":", "");

    return Boolean(
      host
      && originUrl.host.toLowerCase() === host.toLowerCase()
      && originUrl.protocol === `${protocol.toLowerCase()}:`,
    );
  } catch {
    return false;
  }
}

function firstForwardedValue(value: string | null): string {
  return value?.split(",")[0]?.trim() ?? "";
}
