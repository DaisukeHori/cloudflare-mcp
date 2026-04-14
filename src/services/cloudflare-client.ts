import { CF_API_BASE } from "../constants.js";
import type { CfResponse } from "../types.js";

export function getAccountId(): string {
  const id = process.env.CF_ACCOUNT_ID;
  if (!id) throw new Error("CF_ACCOUNT_ID 環境変数が設定されていません。Vercelのプロジェクト設定で追加してください。");
  return id;
}

function getApiToken(): string {
  const token = process.env.CF_API_TOKEN;
  if (!token) throw new Error("CF_API_TOKEN 環境変数が設定されていません。Cloudflareダッシュボードでトークンを作成し、Vercelのプロジェクト設定で追加してください。");
  return token;
}

export async function cfRequest<T>(
  method: string,
  path: string,
  options?: {
    body?: unknown;
    params?: Record<string, string | number | boolean | undefined>;
  }
): Promise<CfResponse<T>> {
  const url = new URL(`${CF_API_BASE}${path}`);
  if (options?.params) {
    for (const [k, v] of Object.entries(options.params)) {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, String(v));
      }
    }
  }

  const fetchOptions: RequestInit = {
    method,
    headers: {
      "Authorization": `Bearer ${getApiToken()}`,
      "Content-Type": "application/json",
    },
  };
  if (options?.body && (method === "POST" || method === "PUT" || method === "PATCH")) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), fetchOptions);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Cloudflare API接続エラー: ${msg}. ネットワーク接続を確認してください。`);
  }

  if (res.status === 401) {
    throw new Error("認証エラー (401): CF_API_TOKENが無効または期限切れです。Cloudflareダッシュボード > My Profile > API Tokens でトークンを確認/再生成してください。");
  }
  if (res.status === 403) {
    throw new Error("権限エラー (403): このAPIトークンに必要な権限がありません。トークンのPermissionsに必要なスコープ（Tunnel: Edit, Zone: Read, DNS: Edit 等）が含まれているか確認してください。");
  }
  if (res.status === 429) {
    throw new Error("レート制限 (429): Cloudflare APIのリクエスト上限に達しました。数分待ってから再試行してください。（上限: 1200 req / 5分）");
  }

  const data = (await res.json()) as CfResponse<T>;

  if (!data.success) {
    const msgs = data.errors.map((e) => `[${e.code}] ${e.message}`).join("; ");
    throw new Error(`Cloudflare APIエラー: ${msgs}`);
  }

  return data;
}

// ── Helpers ──────────────────────────────────────────────────────────

export function accountPath(suffix: string): string {
  return `/accounts/${getAccountId()}${suffix}`;
}

export function zonePath(zoneId: string, suffix: string): string {
  return `/zones/${zoneId}${suffix}`;
}

export function requireConfirm(confirm: boolean | undefined, message: string): void {
  if (confirm !== true) {
    throw new Error(`⚠️ 破壊的操作です。実行するには confirm: true を指定してください。\n${message}`);
  }
}

export function truncateResult(text: string, limit: number = 12000): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + `\n\n... (結果が ${text.length} 文字を超えたため切り詰めました。フィルタやlimitパラメータで絞り込んでください)`;
}

export function formatJson(data: unknown): string {
  return truncateResult(JSON.stringify(data, null, 2));
}
