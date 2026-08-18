/** Server-only admin credentials — never import from client components. */

export const ADMIN_SESSION_COOKIE = "betplus_admin_auth";

export function getAdminCredentials() {
  const password =
    process.env.ADMIN_PASSWORD ??
    (process.env.NODE_ENV === "development" ? "admin123" : "");
  return {
    email: (process.env.ADMIN_EMAIL ?? "admin@betplus.com").trim().toLowerCase(),
    password,
  };
}

export function verifyAdminCredentials(email: string, password: string): boolean {
  const creds = getAdminCredentials();
  if (!creds.password) return false;
  return (
    email.trim().toLowerCase() === creds.email && password === creds.password
  );
}
