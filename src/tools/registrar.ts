import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { cfRequest, accountPath, formatJson } from "../services/cloudflare-client.js";
import type { CfRegistrarDomain } from "../types.js";

export function registerRegistrarTools(server: McpServer): void {
  server.registerTool(
    "cf_list_registrar_domains",
    {
      title: "List Registrar Domains",
      description: `Cloudflare Registrarに登録されているドメイン一覧を取得します。ドメイン名、ステータス、有効期限、自動更新設定、ロック状態が含まれます。`,
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const data = await cfRequest<CfRegistrarDomain[]>("GET", accountPath("/registrar/domains"));
        const domains = data.result.map((d) => ({
          domain_name: d.domain_name,
          status: d.status,
          expires_at: d.expires_at,
          auto_renew: d.auto_renew,
          locked: d.locked,
          privacy: d.privacy,
        }));
        return { content: [{ type: "text", text: formatJson(domains) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("403") || msg.includes("10000")) {
          return {
            content: [{
              type: "text",
              text: "⚠️ Registrar APIにアクセスできません。\n\nこれはCloudflareプラットフォームの既知の制限です:\n- Registrar APIのパーミッションはダッシュボードのトークン作成画面に表示されません\n- APIトークンではなくGlobal API Key（レガシー）でのみアクセス可能です\n- ドメイン登録（新規）のAPIはEnterprise限定です\n\nドメイン情報は cf_list_zones でゾーン単位の確認が可能です。",
            }],
          };
        }
        throw err;
      }
    }
  );

  server.registerTool(
    "cf_get_registrar_domain",
    {
      title: "Get Registrar Domain Details",
      description: `ドメインの詳細情報を取得します。有効期限、自動更新、ロック状態、WHOIS連絡先等が含まれます。

Args:
  - domain_name: ドメイン名（例: "appserver.tokyo"）`,
      inputSchema: {
        domain_name: z.string().min(1).describe("ドメイン名（例: 'appserver.tokyo'）"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ domain_name }) => {
      const data = await cfRequest<CfRegistrarDomain>("GET", accountPath(`/registrar/domains/${domain_name}`));
      return { content: [{ type: "text", text: formatJson(data.result) }] };
    }
  );

  server.registerTool(
    "cf_update_registrar_domain",
    {
      title: "Update Registrar Domain",
      description: `ドメインの設定を変更します。自動更新のON/OFF、ロック状態の変更等が可能です。

Args:
  - domain_name: ドメイン名
  - auto_renew: 自動更新（true/false）
  - locked: ドメインロック（true=移管防止）
  - privacy: WHOIS情報の非公開設定`,
      inputSchema: {
        domain_name: z.string().min(1).describe("ドメイン名"),
        auto_renew: z.boolean().optional().describe("自動更新のON/OFF"),
        locked: z.boolean().optional().describe("ドメインロック（移管防止）"),
        privacy: z.boolean().optional().describe("WHOIS情報の非公開"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ domain_name, auto_renew, locked, privacy }) => {
      const body: Record<string, unknown> = {};
      if (auto_renew !== undefined) body.auto_renew = auto_renew;
      if (locked !== undefined) body.locked = locked;
      if (privacy !== undefined) body.privacy = privacy;

      const data = await cfRequest<CfRegistrarDomain>("PUT", accountPath(`/registrar/domains/${domain_name}`), { body });
      return {
        content: [{
          type: "text",
          text: `✅ ドメイン ${data.result.domain_name} の設定を更新しました。\n\nauto_renew: ${data.result.auto_renew}\nlocked: ${data.result.locked}\nprivacy: ${data.result.privacy}`,
        }],
      };
    }
  );
}
