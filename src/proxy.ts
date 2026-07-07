import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  if (url.pathname === "/mypage") {
    url.pathname = "/library";
    return NextResponse.rewrite(url);
  }
  if (url.pathname.startsWith("/mypage/")) {
    const id = url.pathname.substring(8);
    url.pathname = `/library/${id}`;
    return NextResponse.rewrite(url);
  }
  if (url.pathname === "/emoticon") {
    url.pathname = "/input";
    return NextResponse.rewrite(url);
  }
  if (url.pathname === "/emoticon/edit") {
    url.pathname = "/edit";
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/mypage",
    "/mypage/:path*",
    "/emoticon",
    "/emoticon/edit",
  ],
};
