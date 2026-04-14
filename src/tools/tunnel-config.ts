import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { cfRequest, accountPath, formatJson } from "../services/cloudflare-client.js";
import type { CfTunnelConfig } from "../types.js";

const IngressRuleSchema = z.object({
  hostname: z.string().optional().describe("公開ホスト名（例: 'proxmox.appserver.tokyo'）。catch-allルール（最後のルール）では省略"),
  path: z.string().optional().describe("パスプレフィックス（例: '/api'）"),
  service: z.string().describe("ローカルサービスURL（例: 'https://192.168.70.226:8006', 'http://localhost:3000', 'http_status:404'）"),
  originRequest: z.object({
    noTLSVerify: z.boolean().optional().describe("TLS検証をスキップ（自己署名証明書の場合）"),
    httpHostHeader: z.string().optional().describe("Hostヘッダーの上書き"),
    connectTimeout: z.string().optional().describe("接続タイムアウト（例: '30s'）"),
    disableChunkedEncoding: z.boolean().optional().describe("Chunkedエンコーディングを無効化"),
  }).optional().describe("オリジンリクエスト設定"),
});

export function registerTunnelConfigTools(server: McpServer): void {
  // ── cf_get_tunnel_config ─────────────────────────────────────────
  server.registerTool(
    "cf_get_tunnel_config",
    {
      title: "Get Tunnel Configuration",
      description: `トンネルのingress設定（公開ホスト名↔ローカルサービスのマッピング）を取得します。

各ingressルールは以下を含みます:
  - hostname: 公開ホスト名
  - service: ローカルサービスURL
  - path: パスプレフィックス（オプション）
  - originRequest: TLS設定等（オプション）

最後のルールはcatch-all（hostnameなし）です。`,
      inputSchema: {
        tunnel_id: z.string().min(1).describe("トンネルID"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ tunnel_id }) => {
      const data = await cfRequest<CfTunnelConfig>("GET", accountPath(`/cfd_tunnel/${tunnel_id}/configurations`));
      return { content: [{ type: "text", text: formatJson(data.result) }] };
    }
  );

  // ── cf_update_tunnel_config ──────────────────────────────────────
  server.registerTool(
    "cf_update_tunnel_config",
    {
      title: "Update Tunnel Configuration",
      description: `トンネルのingress設定を全体置換します。

⚠️ 重要: 既存の設定を全て上書きします。既存設定を維持したい場合は、まずcf_get_tunnel_configで現在の設定を取得し、変更を加えた上でこのツールを呼び出してください。

ingressルールの最後は必ずcatch-allルール（hostnameなし、例: service="http_status:404"）にしてください。

Args:
  - tunnel_id: トンネルID
  - ingress: ingressルールの配列
  - warp_routing: WARP経由のプライベートネットワークルーティング設定`,
      inputSchema: {
        tunnel_id: z.string().min(1).describe("トンネルID"),
        ingress: z.array(IngressRuleSchema).min(1).describe("ingressルール配列（最後はcatch-all必須）"),
        warp_routing: z.object({
          enabled: z.boolean(),
        }).optional().describe("WARPルーティング設定"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ tunnel_id, ingress, warp_routing }) => {
      // catch-all検証
      const lastRule = ingress[ingress.length - 1];
      if (lastRule?.hostname) {
        throw new Error("ingressルールの最後はcatch-all（hostnameなし）にしてください。例: { service: 'http_status:404' }");
      }

      const body: Record<string, unknown> = { config: { ingress } };
      if (warp_routing) {
        (body.config as Record<string, unknown>).warp_routing = warp_routing;
      }

      const data = await cfRequest<CfTunnelConfig>("PUT", accountPath(`/cfd_tunnel/${tunnel_id}/configurations`), { body });

      const ruleCount = data.result.config.ingress.length;
      const hostnames = data.result.config.ingress
        .filter((r) => r.hostname)
        .map((r) => `  ${r.hostname} → ${r.service}`)
        .join("\n");

      return {
        content: [{
          type: "text",
          text: `✅ トンネル設定を更新しました。\n\nIngressルール数: ${ruleCount}\n公開ホスト名:\n${hostnames || "  (なし)"}`,
        }],
      };
    }
  );
}
