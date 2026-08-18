import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ADMIN_SESSION_COOKIE = "betplus_admin_auth";

function isAdminPath(pathname: string) {
  return pathname.startsWith("/admin");
}

function isAdminLoginPath(pathname: string) {
  return pathname === "/admin/login";
}

function isStaticAsset(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/brand/")
  );
}

/** When ADMIN_ONLY=true (npm run dev:admin), only admin routes are reachable. */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const adminOnly = process.env.ADMIN_ONLY === "true";

  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  // Public app: admin URLs are hidden — send users home (no login hint).
  if (!adminOnly && isAdminPath(pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (!adminOnly && pathname.startsWith("/api/admin")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (adminOnly) {
    const hasAdminSession =
      request.cookies.get(ADMIN_SESSION_COOKIE)?.value === "1";

    if (isAdminPath(pathname)) {
      if (!isAdminLoginPath(pathname) && !hasAdminSession) {
        return NextResponse.redirect(new URL("/admin/login", request.url));
      }
      return NextResponse.next();
    }

    if (pathname.startsWith("/bet/")) {
      return NextResponse.next();
    }

    if (pathname === "/") {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }

    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
