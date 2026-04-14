import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { cfRequest, accountPath, formatJson } from "../services/cloudflare-client.js";
import type { CfBillingProfile, CfBillingHistory, CfSubscription } from "../types.js";

export function registerBillingTools(server: McpServer): void {
  server.registerTool(
    "cf_get_billing_profile",
    {
      title: "Get Billing Profile",
      description: `請求プロフィールを取得します。支払い方法（カード番号下4桁）、住所、会社名等が含まれます。`,
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const data = await cfRequest<CfBillingProfile>("GET", "/user/billing/profile");
      return { content: [{ type: "text", text: formatJson(data.result) }] };
    }
  );

  server.registerTool(
    "cf_get_billing_history",
    {
      title: "Get Billing History",
      description: `請求履歴を取得します。日付、金額、通貨、種別（charge/credit等）、アクション（subscription/plan_change等）が含まれます。

Args:
  - page / per_page: ページネーション
  - order: ソート順（occured_at）
  - type: 種別フィルタ（charge, credit等）`,
      inputSchema: {
        page: z.number().int().min(1).default(1).describe("ページ番号"),
        per_page: z.number().int().min(5).max(50).default(20).describe("1ページあたりの件数"),
        order: z.string().optional().describe("ソート順（例: 'occured_at'）"),
        type: z.string().optional().describe("種別フィルタ（charge, credit等）"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ page, per_page, order, type }) => {
      const data = await cfRequest<CfBillingHistory[]>("GET", "/user/billing/history", {
        params: { page, per_page, order, type },
      });
      return { content: [{ type: "text", text: formatJson(data.result) }] };
    }
  );

  server.registerTool(
    "cf_list_account_subscriptions",
    {
      title: "List Account Subscriptions",
      description: `アカウントのサブスクリプション一覧を取得します。プラン名、価格、通貨、期間、状態が含まれます。`,
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const data = await cfRequest<CfSubscription[]>("GET", accountPath("/subscriptions"));
      return { content: [{ type: "text", text: formatJson(data.result) }] };
    }
  );

  server.registerTool(
    "cf_get_billing_usage",
    {
      title: "Get Billing Usage (Beta)",
      description: `PayGoアカウントの利用量を取得します（Beta API）。`,
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const data = await cfRequest<unknown>("GET", accountPath("/billing/usage"));
        return { content: [{ type: "text", text: formatJson(data.result) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `利用量の取得に失敗しました（このAPIはBetaのため、プランによっては利用できません）: ${msg}` }] };
      }
    }
  );
}
