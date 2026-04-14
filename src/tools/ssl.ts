import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { cfRequest, zonePath, formatJson } from "../services/cloudflare-client.js";

export function registerSslTools(server: McpServer): void {
  server.registerTool(
    "cf_get_ssl_setting",
    {
      title: "Get SSL/TLS Setting",
      description: `ゾーンのSSL/TLSモードを取得します。

返り値: off, flexible, full, strict のいずれか。
  - off: 暗号化なし
  - flexible: Cloudflare↔ブラウザ間のみ暗号化
  - full: Cloudflare↔オリジン間も暗号化（自己署名証明書OK）
  - strict: Cloudflare↔オリジン間も暗号化（有効な証明書必須）`,
      inputSchema: {
        zone_id: z.string().min(1).describe("ゾーンID"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ zone_id }) => {
      const data = await cfRequest<{ id: string; value: string; editable: boolean }>("GET", zonePath(zone_id, "/settings/ssl"));
      return {
        content: [{
          type: "text",
          text: `SSL/TLSモード: ${data.result.value}\n変更可能: ${data.result.editable}`,
        }],
      };
    }
  );

  server.registerTool(
    "cf_list_ssl_certificates",
    {
      title: "List SSL Certificate Packs",
      description: `ゾーンのSSL証明書パック一覧を取得します。証明書のタイプ、ステータス、有効期限、対象ホスト名が含まれます。`,
      inputSchema: {
        zone_id: z.string().min(1).describe("ゾーンID"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ zone_id }) => {
      const data = await cfRequest<unknown[]>("GET", zonePath(zone_id, "/ssl/certificate_packs"));
      return { content: [{ type: "text", text: formatJson(data.result) }] };
    }
  );
}
