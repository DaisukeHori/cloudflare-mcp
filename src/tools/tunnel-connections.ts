import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { cfRequest, accountPath, requireConfirm, formatJson } from "../services/cloudflare-client.js";
import type { CfTunnelConnection } from "../types.js";

export function registerTunnelConnectionTools(server: McpServer): void {
  // ── cf_list_tunnel_connections ────────────────────────────────────
  server.registerTool(
    "cf_list_tunnel_connections",
    {
      title: "List Tunnel Connections",
      description: `トンネルのアクティブな接続（cloudflaredプロセス）一覧を取得します。

各接続の情報:
  - id: 接続ID
  - colo_name: 接続先Cloudflareデータセンター（例: NRT, LAX）
  - origin_ip: cloudflaredのIPアドレス
  - version: cloudflaredバージョン
  - arch: アーキテクチャ（例: linux_amd64）
  - opened_at: 接続開始時刻`,
      inputSchema: {
        tunnel_id: z.string().min(1).describe("トンネルID"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ tunnel_id }) => {
      const data = await cfRequest<CfTunnelConnection[]>("GET", accountPath(`/cfd_tunnel/${tunnel_id}/connections`));
      return {
        content: [{
          type: "text",
          text: formatJson({ connection_count: data.result.length, connections: data.result }),
        }],
      };
    }
  );

  // ── cf_clean_tunnel_connections ───────────────────────────────────
  server.registerTool(
    "cf_clean_tunnel_connections",
    {
      title: "Clean Tunnel Connections",
      description: `トンネルの全接続を強制切断します。トンネル削除前やトークンローテーション時に使用します。

⚠️ 破壊的操作: confirm: true が必須です。
接続中のcloudflaredは全て切断され、サービスが一時的にダウンします。`,
      inputSchema: {
        tunnel_id: z.string().min(1).describe("トンネルID"),
        confirm: z.boolean().describe("trueを指定して強制切断を確認"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ tunnel_id, confirm }) => {
      requireConfirm(confirm, `トンネル '${tunnel_id}' の全接続を強制切断します。サービスが一時的にダウンする可能性があります。`);
      await cfRequest<unknown>("DELETE", accountPath(`/cfd_tunnel/${tunnel_id}/connections`));
      return { content: [{ type: "text", text: `✅ トンネル ${tunnel_id} の全接続を切断しました。` }] };
    }
  );
}
