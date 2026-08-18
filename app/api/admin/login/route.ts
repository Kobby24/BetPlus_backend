import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  verifyAdminCredentials,
} from "@/lib/admin-auth.server";

async function tryFastApiAdmin(
  email: string,
  password: string,
): Promise<string | null> {
  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";
  try {
    const data = new URLSearchParams();
    data.append("username", email);
    data.append("password", password);
    const login = await fetch(`${backendUrl}/api/v1/auth/login`, {
      method: "POST",
      body: data,
    });
    if (!login.ok) return null;
    const token = (await login.json()) as { access_token?: string };
    if (!token.access_token) return null;
    const me = await fetch(`${backendUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!me.ok) return null;
    const user = (await me.json()) as { is_admin?: boolean };
    if (!user.is_admin) return null;
    return token.access_token;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    const email = body.email?.trim() ?? "";
    const password = body.password ?? "";

    const accessToken = await tryFastApiAdmin(email, password);
    const envOk = verifyAdminCredentials(email, password);

    if (!accessToken && !envOk) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const response = NextResponse.json({
      ok: true,
      access_token: accessToken ?? null,
    });
    response.cookies.set(ADMIN_SESSION_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
