import { NextResponse, type NextRequest } from "next/server";

// Cheap gate: cookie presence. Real verification happens server-side in getSession().
export function middleware(req: NextRequest) {
  const has = req.cookies.get("nss_session");
  if (!has && req.nextUrl.pathname !== "/login") return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}
export const config = { matcher: ["/((?!_next|favicon.ico|api/health).*)"] };
