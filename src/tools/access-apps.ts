import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { cfRequest, accountPath, requireConfirm, formatJson } from "../services/cloudflare-client.js";
import type { CfAccessApp } from "../types.js";

export function registerAccessAppTools(server: McpServer): void {
  server.registerTool(
    "cf_list_access_apps",
    {
      title: "List Access Applications",
      description: `Cloudflare Accessアプリケーション一覧を取得します。各アプリのID、名前、ドメイン、タイプ、セッション期間が含まれます。`,
      inputSchema: {
        page: z.number().int().min(1).default(1).describe("ページ番号"),
        per_page: z.number().int().min(5).max(50).default(20).describe("1ページあたりの件数"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ page, per_page }) => {
      const data = await cfRequest<CfAccessApp[]>("GET", accountPath("/access/apps"), { params: { page, per_page } });
      return { content: [{ type: "text", text: formatJson(data.result) }] };
    }
  );

  server.registerTool(
    "cf_get_access_app",
    {
      title: "Get Access Application",
      description: `Accessアプリケーションの詳細を取得します。`,
      inputSchema: {
        app_id: z.string().min(1).describe("アプリケーションID"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ app_id }) => {
      const data = await cfRequest<CfAccessApp>("GET", accountPath(`/access/apps/${app_id}`));
      return { content: [{ type: "text", text: formatJson(data.result) }] };
    }
  );

  server.registerTool(
    "cf_create_access_app",
    {
      title: "Create Access Application",
      description: `Cloudflare Accessアプリケーションを作成します。Tunnel経由で公開するサービスにアクセス制御を追加する際に使用します。

Args:
  - name: アプリ名
  - domain: ドメイン（例: "proxmox.appserver.tokyo"）
  - type: アプリタイプ（self_hosted, saas, ssh, vnc, bookmark等）
  - session_duration: セッション期間（例: "24h", "12h", "30m"）`,
      inputSchema: {
        name: z.string().min(1).describe("アプリケーション名"),
        domain: z.string().min(1).describe("ドメイン（例: 'proxmox.appserver.tokyo'）"),
        type: z.enum(["self_hosted", "saas", "ssh", "vnc", "bookmark", "app_launcher"]).default("self_hosted").describe("アプリタイプ"),
        session_duration: z.string().default("24h").describe("セッション期間（例: '24h'）"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ name, domain, type, session_duration }) => {
      const data = await cfRequest<CfAccessApp>("POST", accountPath("/access/apps"), {
        body: { name, domain, type, session_duration },
      });
      return {
        content: [{
          type: "text",
          text: `✅ Accessアプリを作成しました。\n\nID: ${data.result.id}\nName: ${data.result.name}\nDomain: ${data.result.domain}\nType: ${data.result.type}\n\n次のステップ: cf_create_access_policy でポリシーを追加してください。`,
        }],
      };
    }
  );

  server.registerTool(
    "cf_update_access_app",
    {
      title: "Update Access Application",
      description: `Accessアプリケーションを更新します。`,
      inputSchema: {
        app_id: z.string().min(1).describe("アプリケーションID"),
        name: z.string().optional().describe("新しい名前"),
        domain: z.string().optional().describe("新しいドメイン"),
        session_duration: z.string().optional().describe("新しいセッション期間"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ app_id, name, domain, session_duration }) => {
      const body: Record<string, unknown> = {};
      if (name) body.name = name;
      if (domain) body.domain = domain;
      if (session_duration) body.session_duration = session_duration;

      const data = await cfRequest<CfAccessApp>("PUT", accountPath(`/access/apps/${app_id}`), { body });
      return { content: [{ type: "text", text: `✅ Accessアプリ '${data.result.name}' を更新しました。` }] };
    }
  );

  server.registerTool(
    "cf_delete_access_app",
    {
      title: "Delete Access Application",
      description: `Accessアプリケーションを削除します。関連するポリシーも削除されます。

⚠️ 破壊的操作: confirm: true が必須です。`,
      inputSchema: {
        app_id: z.string().min(1).describe("アプリケーションID"),
        confirm: z.boolean().describe("trueを指定して削除を確認"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ app_id, confirm }) => {
      requireConfirm(confirm, `Accessアプリ '${app_id}' と関連ポリシーを削除します。`);
      await cfRequest<unknown>("DELETE", accountPath(`/access/apps/${app_id}`));
      return { content: [{ type: "text", text: `✅ Accessアプリ ${app_id} を削除しました。` }] };
    }
  );
}
