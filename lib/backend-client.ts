const TOKEN_KEY = "betplus_access_token";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getAccessToken(): string | null {
  return getToken();
}

async function parseJson(resp: Response): Promise<unknown> {
  const text = await resp.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (options.auth !== false) {
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const resp = await fetch(path, { ...options, headers });
  const data = await parseJson(resp);

  if (!resp.ok) {
    const detail =
      typeof data === "object" && data && "detail" in data
        ? String((data as { detail: unknown }).detail)
        : resp.statusText;
    throw new ApiError(detail || "Request failed", resp.status, data);
  }

  return data as T;
}

export interface BackendUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  balance: number;
  is_admin: boolean;
  is_manager: boolean;
  referral_code: string | null;
  referred_by_manager_id: string | null;
  settings: Record<string, unknown>;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export async function registerUser(input: {
  name: string;
  email: string;
  phone?: string;
  password: string;
  referralCode?: string;
}): Promise<BackendUser> {
  return apiRequest<BackendUser>("/api/v1/auth/register", {
    method: "POST",
    auth: false,
    body: JSON.stringify({
      name: input.name,
      email: input.email,
      phone: input.phone,
      password: input.password,
      referral_code: input.referralCode,
    }),
  });
}

export async function loginUser(input: {
  identifier: string;
  password: string;
}): Promise<TokenResponse> {
  const data = new URLSearchParams();
  data.append("username", input.identifier);
  data.append("password", input.password);
  return apiRequest<TokenResponse>("/api/v1/auth/login", {
    method: "POST",
    auth: false,
    body: data,
  });
}

export async function fetchCurrentUser(): Promise<BackendUser> {
  return apiRequest<BackendUser>("/api/v1/auth/me");
}

export async function deposit(amount: number, description = "") {
  return apiRequest<BackendTransaction>("/api/v1/wallet/deposit", {
    method: "POST",
    body: JSON.stringify({ amount, description }),
  });
}

export async function withdraw(amount: number, description = "") {
  return apiRequest<BackendTransaction>("/api/v1/wallet/withdraw", {
    method: "POST",
    body: JSON.stringify({ amount, description }),
  });
}

export interface BackendTransaction {
  id: string;
  user_id: string;
  bet_id: string | null;
  type: string;
  amount: number;
  description: string | null;
  created_at: string;
}

export interface BackendBetSelection {
  id: string;
  leg_index: number;
  match_id: string;
  home_team: string;
  away_team: string;
  selection: string;
  selection_label: string;
  odds: number;
  league: string;
  market_id: string | null;
  market_name: string | null;
  outcome_label: string | null;
  manager_ft_score: { home: number; away: number } | null;
}

export interface BackendBet {
  id: string;
  user_id: string;
  booking_code: string;
  ticket_id: string | null;
  verify_code: string | null;
  stake: number;
  total_odds: number;
  potential_win: number;
  bonus: number;
  flex_cut: number | null;
  status: string;
  payout: number | null;
  leg_results: unknown[] | null;
  placed_at: string;
  settled_at: string | null;
  selections: BackendBetSelection[];
}

export async function getTransactions() {
  return apiRequest<BackendTransaction[]>("/api/v1/wallet/transactions");
}

export async function getSports() {
  return apiRequest("/api/v1/catalog/sports", { auth: false });
}

export async function placeBet(input: {
  stake: number;
  selections: Array<{
    match_id: string;
    home_team: string;
    away_team: string;
    selection: string;
    selection_label: string;
    odds: number;
    league?: string;
    market_id?: string;
    market_name?: string;
  }>;
  flex_cut?: number;
}) {
  return apiRequest<BackendBet>("/api/v1/bets/place", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getMyBets() {
  return apiRequest<BackendBet[]>("/api/v1/bets/my");
}

export async function getBetByCode(code: string) {
  return apiRequest<BackendBet>(`/api/v1/bets/code/${encodeURIComponent(code)}`, {
    auth: false,
  });
}

export async function getBetByVerifyCode(code: string) {
  return apiRequest<BackendBet>(`/api/v1/bets/verify/${encodeURIComponent(code)}`, {
    auth: false,
  });
}

export function isBackendEnabled(): boolean {
  return process.env.NEXT_PUBLIC_USE_BACKEND === "true";
}

export function useBackendApi(): boolean {
  return isBackendEnabled();
}

export async function updateProfile(input: {
  name?: string;
  email?: string;
  phone?: string;
}): Promise<BackendUser> {
  return apiRequest<BackendUser>("/api/v1/auth/me", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<BackendUser> {
  return apiRequest<BackendUser>("/api/v1/auth/me/password", {
    method: "POST",
    body: JSON.stringify({
      current_password: input.currentPassword,
      new_password: input.newPassword,
    }),
  });
}

export async function updateSettings(input: Record<string, unknown>): Promise<BackendUser> {
  return apiRequest<BackendUser>("/api/v1/auth/me/settings", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export interface BackendAdminStats {
  users: number;
  bets: number;
  open_bets: number;
  total_user_balance: number;
  platform_balance: number;
  net_position: number;
}

export interface BackendLedgerEntry {
  id: string;
  entry_type: string;
  amount: number;
  description: string;
  user_id: string | null;
  bet_id: string | null;
  created_at: string | null;
}

export interface BackendAuditEntry {
  id: string;
  actor_id: string | null;
  role: string;
  action: string;
  detail: string;
  bet_id: string | null;
  match_id: string | null;
  booking_code: string | null;
  created_at: string | null;
}

export interface BackendManagerMatch {
  id: number;
  match_id: string;
  home_team: string;
  away_team: string;
  home_abbr: string | null;
  away_abbr: string | null;
  league: string;
  sport: string;
  kickoff: string | null;
  status: string;
  home_score: number;
  away_score: number;
  is_manual: boolean;
  managed: boolean;
  note: string | null;
  game_status: string;
  is_live: boolean;
  updated_at: string | null;
}

export interface BackendReferralUser {
  user_id: string;
  name: string;
  email: string;
  phone: string | null;
  signed_up_at: string;
  deposit_count: number;
  total_deposited: number;
  gross_revenue: number;
  commission_earned: number;
}

export interface BackendReferralStats {
  manager_id?: string;
  referral_code: string;
  invite_link: string;
  signup_count: number;
  total_deposits: number;
  gross_revenue: number;
  manager_earnings: number;
  platform_earnings: number;
  referrals: BackendReferralUser[];
}

export interface BackendManagerReferralRow {
  manager_id: string;
  name: string;
  email: string;
  referral_code: string;
  signup_count: number;
  total_deposits: number;
  gross_revenue: number;
  manager_earnings: number;
  platform_earnings: number;
}

export async function adminGetStats() {
  return apiRequest<BackendAdminStats>("/api/v1/admin/stats");
}

export async function adminGetUsers() {
  return apiRequest<BackendUser[]>("/api/v1/admin/users");
}

export async function adminGetUser(userId: string) {
  return apiRequest<BackendUser>(`/api/v1/admin/users/${userId}`);
}

export async function adminPatchUser(
  userId: string,
  patch: { is_manager?: boolean; balance?: number },
) {
  return apiRequest<BackendUser>(`/api/v1/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function adminCreditUser(
  userId: string,
  amount: number,
  description?: string,
) {
  return apiRequest<BackendTransaction>(`/api/v1/admin/users/${userId}/credit`, {
    method: "POST",
    body: JSON.stringify({ amount, description }),
  });
}

export async function adminGetUserTransactions(userId: string) {
  return apiRequest<BackendTransaction[]>(
    `/api/v1/admin/users/${userId}/transactions`,
  );
}

export async function adminGetUserBets(userId: string) {
  return apiRequest<BackendBet[]>(`/api/v1/admin/users/${userId}/bets`);
}

export async function adminGetBets() {
  return apiRequest<BackendBet[]>("/api/v1/admin/bets");
}

export async function adminGetBet(betId: string) {
  return apiRequest<BackendBet>(`/api/v1/admin/bets/${betId}`);
}

export async function adminPatchBet(
  betId: string,
  patch: {
    stake?: number;
    selections?: Array<{
      match_id: string;
      home_team: string;
      away_team: string;
      selection: string;
      selection_label: string;
      odds: number;
      league?: string;
      market_id?: string;
      market_name?: string;
    }>;
  },
) {
  return apiRequest<BackendBet>(`/api/v1/admin/bets/${betId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function adminSettleBetApi(betId: string, status: string) {
  return apiRequest<BackendBet>(`/api/v1/admin/bets/${betId}/settle`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}

export async function adminRunSettlement() {
  return apiRequest<{ settled: number }>("/api/v1/admin/settlement/run", {
    method: "POST",
  });
}

export async function adminGetLedger() {
  return apiRequest<BackendLedgerEntry[]>("/api/v1/admin/ledger");
}

export async function adminGetReferrals() {
  return apiRequest<BackendManagerReferralRow[]>("/api/v1/admin/referrals");
}

export async function adminGetReferralDetail(managerId: string) {
  return apiRequest<BackendReferralStats>(`/api/v1/admin/referrals/${managerId}`);
}

export async function adminGetAudit() {
  return apiRequest<BackendAuditEntry[]>("/api/v1/admin/audit");
}

export async function managerGetMatches() {
  return apiRequest<BackendManagerMatch[]>("/api/v1/manager/matches");
}

export async function managerCreateMatch(input: {
  home_team: string;
  away_team: string;
  league: string;
  sport?: string;
  kickoff?: string;
  note?: string;
}) {
  return apiRequest<BackendManagerMatch>("/api/v1/manager/matches", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function managerUpdateMatch(
  matchId: string,
  patch: Record<string, unknown>,
) {
  return apiRequest<BackendManagerMatch>(
    `/api/v1/manager/matches/${encodeURIComponent(matchId)}`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
}

export async function managerTakeControl(matchId: string) {
  return apiRequest<BackendManagerMatch>(
    `/api/v1/manager/matches/${encodeURIComponent(matchId)}/control`,
    { method: "POST" },
  );
}

export async function managerReleaseControl(matchId: string) {
  return apiRequest<{ ok: boolean }>(
    `/api/v1/manager/matches/${encodeURIComponent(matchId)}/control`,
    { method: "DELETE" },
  );
}

export async function managerDeleteMatch(matchId: string) {
  return apiRequest<{ ok: boolean }>(
    `/api/v1/manager/matches/${encodeURIComponent(matchId)}`,
    { method: "DELETE" },
  );
}

export async function managerUpdateLeg(
  betId: string,
  legIndex: number,
  patch: Record<string, unknown>,
) {
  return apiRequest<BackendBet>(
    `/api/v1/manager/bets/${betId}/legs/${legIndex}`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
}

export async function managerGetReferrals() {
  return apiRequest<BackendReferralStats>("/api/v1/manager/referrals");
}

export async function managerGetAudit() {
  return apiRequest<BackendAuditEntry[]>("/api/v1/manager/audit");
}
