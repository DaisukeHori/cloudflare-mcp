import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { cfRequest, requireConfirm, formatJson } from "../services/cloudflare-client.js";
import type { CfZone, CfZoneSetting } from "../types.js";

export function registerZoneTools(server: McpServer): void {
  // ── cf_list_zones ────────────────────────────────────────────────
  server.registerTool(
    "cf_list_zones",
    {
      title: "List Zones",
      description: `Cloudflareに登録されているゾーン（ドメイン）の一覧を取得します。ゾーンID、名前、ステータス、ネームサーバー、プラン情報が含まれます。

Args:
  - name: ドメイン名でフィルタ（完全一致、例: "appserver.tokyo"）
  - status: ステータスでフィルタ（active, pending, initializing, moved, deleted, deactivated）
  - page / per_page: ページネーション`,
      inputSchema: {
        name: z.string().optional().describe("ドメイン名フィルタ（完全一致）"),
        status: z.enum(["active", "pending", "initializing", "moved", "deleted", "deactivated"]).optional().describe("ステータスフィルタ"),
        page: z.number().int().min(1).default(1).describe("ページ番号"),
        per_page: z.number().int().min(5).max(50).default(20).describe("1ページあたりの件数"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ name, status, page, per_page }) => {
      const data = await cfRequest<CfZone[]>("GET", "/zones", { params: { name, status, page, per_page } });
      const summary = data.result.map((z) => ({
        id: z.id,
        name: z.name,
        status: z.status,
        plan: z.plan?.name,
        name_servers: z.name_servers,
      }));
      return { content: [{ type: "text", text: formatJson(summary) }] };
    }
  );

  // ── cf_get_zone ──────────────────────────────────────────────────
  server.registerTool(
    "cf_get_zone",
    {
      title: "Get Zone Details",
      description: `ゾーンの詳細情報を取得します。ID、ステータス、ネームサーバー、プラン、作成日時等。`,
      inputSchema: {
        zone_id: z.string().min(1).describe("ゾーンID（cf_list_zonesで取得）"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ zone_id }) => {
      const data = await cfRequest<CfZone>("GET", `/zones/${zone_id}`);
      return { content: [{ type: "text", text: formatJson(data.result) }] };
    }
  );

  // ── cf_create_zone ───────────────────────────────────────────────
  server.registerTool(
    "cf_create_zone",
    {
      title: "Create Zone",
      description: `新しいゾーン（ドメイン）をCloudflareに追加します。追加後、ドメインのネームサーバーをCloudflareに変更する必要があります。

Args:
  - name: ドメイン名（例: "example.com"）
  - type: "full"（ネームサーバー変更）または "partial"（CNAME setup）`,
      inputSchema: {
        name: z.string().min(1).describe("ドメイン名（例: 'example.com'）"),
        type: z.enum(["full", "partial"]).default("full").describe("full=ネームサーバー変更, partial=CNAME setup"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ name, type }) => {
      const account = { id: process.env.CF_ACCOUNT_ID || "" };
      const data = await cfRequest<CfZone>("POST", "/zones", { body: { name, type, account } });
      return {
        content: [{
          type: "text",
          text: `✅ ゾーンを作成しました。\n\nID: ${data.result.id}\nName: ${data.result.name}\nStatus: ${data.result.status}\nNameservers: ${data.result.name_servers?.join(", ")}\n\n⚠️ ドメインのネームサーバーを上記に変更してください。`,
        }],
      };
    }
  );

  // ── cf_delete_zone ───────────────────────────────────────────────
  server.registerTool(
    "cf_delete_zone",
    {
      title: "Delete Zone",
      description: `ゾーン（ドメイン）をCloudflareから削除します。全DNSレコード、設定、ファイアウォールルール等が失われます。

⚠️ 破壊的操作: confirm: true が必須です。`,
      inputSchema: {
        zone_id: z.string().min(1).describe("ゾーンID"),
        confirm: z.boolean().describe("trueを指定して削除を確認"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ zone_id, confirm }) => {
      requireConfirm(confirm, `ゾーン '${zone_id}' を削除します。全DNSレコード・設定が消失します。`);
      const data = await cfRequest<{ id: string }>("DELETE", `/zones/${zone_id}`);
      return { content: [{ type: "text", text: `✅ ゾーン ${data.result.id} を削除しました。` }] };
    }
  );

  // ── cf_get_zone_settings ─────────────────────────────────────────
  server.registerTool(
    "cf_get_zone_settings",
    {
      title: "Get Zone Settings",
      description: `ゾーンの全設定を取得します。SSL/TLS、キャッシュ、セキュリティ、minify、Always Online等の設定が含まれます。`,
      inputSchema: {
        zone_id: z.string().min(1).describe("ゾーンID"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ zone_id }) => {
      const data = await cfRequest<CfZoneSetting[]>("GET", `/zones/${zone_id}/settings`);
      const settings = data.result.map((s) => ({ id: s.id, value: s.value, editable: s.editable }));
      return { content: [{ type: "text", text: formatJson(settings) }] };
    }
  );
}
