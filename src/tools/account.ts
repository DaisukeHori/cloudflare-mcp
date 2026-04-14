import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { cfRequest, accountPath, formatJson } from "../services/cloudflare-client.js";
import type { CfAccount, CfAccountMember, CfUser } from "../types.js";

export function registerAccountTools(server: McpServer): void {
  // ── cf_list_accounts ─────────────────────────────────────────────
  server.registerTool(
    "cf_list_accounts",
    {
      title: "List Cloudflare Accounts",
      description: `Cloudflareアカウント一覧を取得します。

Returns: アカウントID、名前、タイプの一覧。`,
      inputSchema: {
        page: z.number().int().min(1).default(1).describe("ページ番号"),
        per_page: z.number().int().min(5).max(50).default(20).describe("1ページあたりの件数"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ page, per_page }) => {
      const data = await cfRequest<CfAccount[]>("GET", "/accounts", { params: { page, per_page } });
      return { content: [{ type: "text", text: formatJson(data.result) }] };
    }
  );

  // ── cf_get_account ───────────────────────────────────────────────
  server.registerTool(
    "cf_get_account",
    {
      title: "Get Account Details",
      description: `Cloudflareアカウントの詳細情報を取得します。

Args:
  - account_id: アカウントID（省略時は環境変数CF_ACCOUNT_IDを使用）`,
      inputSchema: {
        account_id: z.string().optional().describe("アカウントID（省略時はデフォルトアカウント）"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ account_id }) => {
      const id = account_id || process.env.CF_ACCOUNT_ID || "";
      const data = await cfRequest<CfAccount>("GET", `/accounts/${id}`);
      return { content: [{ type: "text", text: formatJson(data.result) }] };
    }
  );

  // ── cf_list_account_members ──────────────────────────────────────
  server.registerTool(
    "cf_list_account_members",
    {
      title: "List Account Members",
      description: `アカウントのメンバー（ユーザー）一覧を取得します。各メンバーのメールアドレス、ロール、ステータスが含まれます。`,
      inputSchema: {
        page: z.number().int().min(1).default(1).describe("ページ番号"),
        per_page: z.number().int().min(5).max(50).default(20).describe("1ページあたりの件数"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ page, per_page }) => {
      const data = await cfRequest<CfAccountMember[]>("GET", accountPath("/members"), { params: { page, per_page } });
      return { content: [{ type: "text", text: formatJson(data.result) }] };
    }
  );

  // ── cf_get_user ──────────────────────────────────────────────────
  server.registerTool(
    "cf_get_user",
    {
      title: "Get Current User",
      description: `現在のAPIトークンに紐づくユーザー情報を取得します。メールアドレス、名前、2FA状態等が含まれます。

注意: このエンドポイントはUser-levelのトークン権限が必要です。Account-scopeのAPIトークンでは403が返る場合があります。その場合は cf_list_account_members でメンバー情報を確認してください。`,
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const data = await cfRequest<CfUser>("GET", "/user");
        return { content: [{ type: "text", text: formatJson(data.result) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("403")) {
          return {
            content: [{
              type: "text",
              text: "⚠️ /user エンドポイントにはUser-levelの「User Details: Read」権限が必要です。\nこの権限はダッシュボードのカスタムトークン作成画面には表示されません（API経由でのみ設定可能）。\n\n代替手段: cf_list_account_members でアカウントメンバー情報を確認できます。",
            }],
          };
        }
        throw err;
      }
    }
  );
}
