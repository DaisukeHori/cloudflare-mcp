import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { cfRequest, accountPath, requireConfirm, formatJson } from "../services/cloudflare-client.js";
import type { CfTunnel } from "../types.js";
import { randomBytes } from "crypto";

export function registerTunnelTools(server: McpServer): void {
  // ── cf_list_tunnels ──────────────────────────────────────────────
  server.registerTool(
    "cf_list_tunnels",
    {
      title: "List Cloudflare Tunnels",
      description: `Cloudflare Tunnel（cloudflared）の一覧を取得します。名前、ステータス、接続情報が含まれます。

Args:
  - name: トンネル名でフィルタ（部分一致）
  - status: ステータスでフィルタ（healthy, degraded, down, inactive）
  - is_deleted: 削除済みを含めるか（デフォルト: false）`,
      inputSchema: {
        name: z.string().optional().describe("トンネル名フィルタ"),
        status: z.enum(["healthy", "degraded", "down", "inactive"]).optional().describe("ステータスフィルタ"),
        is_deleted: z.boolean().default(false).describe("削除済みを含めるか"),
        page: z.number().int().min(1).default(1).describe("ページ番号"),
        per_page: z.number().int().min(5).max(100).default(20).describe("1ページあたりの件数"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ name, status, is_deleted, page, per_page }) => {
      const data = await cfRequest<CfTunnel[]>("GET", accountPath("/cfd_tunnel"), {
        params: { name, status, is_deleted, page, per_page },
      });
      const tunnels = data.result.map((t) => ({
        id: t.id,
        name: t.name,
        status: t.status,
        connections: t.connections?.length ?? 0,
        created_at: t.created_at,
      }));
      return {
        content: [{
          type: "text",
          text: formatJson({ total: data.result_info?.total_count, count: tunnels.length, tunnels }),
        }],
      };
    }
  );

  // ── cf_get_tunnel ────────────────────────────────────────────────
  server.registerTool(
    "cf_get_tunnel",
    {
      title: "Get Tunnel Details",
      description: `トンネルの詳細情報を取得します。接続中のcloudflaredの情報（IP、colo、バージョン等）も含まれます。`,
      inputSchema: {
        tunnel_id: z.string().min(1).describe("トンネルID（UUID）"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ tunnel_id }) => {
      const data = await cfRequest<CfTunnel>("GET", accountPath(`/cfd_tunnel/${tunnel_id}`));
      return { content: [{ type: "text", text: formatJson(data.result) }] };
    }
  );

  // ── cf_create_tunnel ─────────────────────────────────────────────
  server.registerTool(
    "cf_create_tunnel",
    {
      title: "Create Tunnel",
      description: `新しいCloudflare Tunnelを作成します。tunnel_secretは自動生成されます。

作成後、cloudflaredをインストールしてトンネルトークンで起動する必要があります。
トークンはcf_get_tunnel_tokenで取得できます。

Args:
  - name: トンネル名（例: "ccp-proxmox", "revol-web"）
  - config_src: "cloudflare"（API経由のリモート管理、推奨）または "local"（ローカルYAML）`,
      inputSchema: {
        name: z.string().min(1).max(100).describe("トンネル名"),
        config_src: z.enum(["cloudflare", "local"]).default("cloudflare").describe("設定ソース（cloudflare推奨）"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ name, config_src }) => {
      const tunnel_secret = randomBytes(32).toString("base64");
      const data = await cfRequest<CfTunnel & { token?: string }>("POST", accountPath("/cfd_tunnel"), {
        body: { name, tunnel_secret, config_src },
      });
      return {
        content: [{
          type: "text",
          text: `✅ トンネルを作成しました。\n\nID: ${data.result.id}\nName: ${data.result.name}\nStatus: ${data.result.status}\n\n次のステップ:\n1. cf_get_tunnel_token でトークンを取得\n2. cloudflared tunnel run --token <TOKEN> で起動\n3. cf_update_tunnel_config でingressルールを設定`,
        }],
      };
    }
  );

  // ── cf_update_tunnel ─────────────────────────────────────────────
  server.registerTool(
    "cf_update_tunnel",
    {
      title: "Update Tunnel",
      description: `トンネルの名前を変更します。`,
      inputSchema: {
        tunnel_id: z.string().min(1).describe("トンネルID"),
        name: z.string().min(1).max(100).describe("新しいトンネル名"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ tunnel_id, name }) => {
      const data = await cfRequest<CfTunnel>("PATCH", accountPath(`/cfd_tunnel/${tunnel_id}`), { body: { name } });
      return { content: [{ type: "text", text: `✅ トンネル名を '${data.result.name}' に変更しました。` }] };
    }
  );

  // ── cf_delete_tunnel ─────────────────────────────────────────────
  server.registerTool(
    "cf_delete_tunnel",
    {
      title: "Delete Tunnel",
      description: `トンネルを削除します。接続中のcloudflaredは切断されます。

⚠️ 破壊的操作: confirm: true が必須です。
削除前に全接続を切断する必要がある場合があります（cf_clean_tunnel_connections）。`,
      inputSchema: {
        tunnel_id: z.string().min(1).describe("トンネルID"),
        confirm: z.boolean().describe("trueを指定して削除を確認"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ tunnel_id, confirm }) => {
      requireConfirm(confirm, `トンネル '${tunnel_id}' を削除します。接続中のcloudflaredは切断されます。`);
      const data = await cfRequest<CfTunnel>("DELETE", accountPath(`/cfd_tunnel/${tunnel_id}`));
      return { content: [{ type: "text", text: `✅ トンネル ${data.result.id} (${data.result.name}) を削除しました。` }] };
    }
  );

  // ── cf_get_tunnel_token ──────────────────────────────────────────
  server.registerTool(
    "cf_get_tunnel_token",
    {
      title: "Get Tunnel Token",
      description: `cloudflared起動用のトンネルトークンを取得します。

使用方法: cloudflared tunnel run --token <TOKEN>

⚠️ トークンは機密情報です。安全に管理してください。`,
      inputSchema: {
        tunnel_id: z.string().min(1).describe("トンネルID"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ tunnel_id }) => {
      const data = await cfRequest<string>("GET", accountPath(`/cfd_tunnel/${tunnel_id}/token`));
      return {
        content: [{
          type: "text",
          text: `🔑 トンネルトークン:\n\n${data.result}\n\n起動コマンド:\ncloudflared tunnel run --token ${data.result}`,
        }],
      };
    }
  );
}
