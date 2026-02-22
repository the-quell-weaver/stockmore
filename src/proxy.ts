import { updateSession } from "@/lib/supabase/proxy";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const canonicalRedirect = toCanonicalLoopbackHost(request);
  if (canonicalRedirect) {
    return canonicalRedirect;
  }

  if (!request.nextUrl.pathname.startsWith("/stock")) {
    return NextResponse.next({ request });
  }

  return await updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

function toCanonicalLoopbackHost(request: NextRequest): NextResponse | null {
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  const hostname = request.nextUrl.hostname;
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    return null;
  }

  const canonicalHost = process.env.DEV_CANONICAL_HOST ?? "localhost";
  if (canonicalHost !== "localhost" && canonicalHost !== "127.0.0.1") {
    return null;
  }

  if (hostname === canonicalHost) {
    return null;
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.hostname = canonicalHost;
  return NextResponse.redirect(redirectUrl, { status: 307 });
}
