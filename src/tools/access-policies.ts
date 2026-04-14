import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { cfRequest, accountPath, requireConfirm, formatJson } from "../services/cloudflare-client.js";
import type { CfAccessPolicy } from "../types.js";

const AccessRuleSchema = z.object({
  email: z.object({ email: z.string() }).optional(),
  email_domain: z.object({ domain: z.string() }).optional(),
  ip: z.object({ ip: z.string() }).optional(),
  everyone: z.object({}).optional(),
  service_token: z.object({ token_id: z.string() }).optional(),
}).describe("Accessルール（email, email_domain, ip, everyone, service_token のいずれか）");

export function registerAccessPolicyTools(server: McpServer): void {
  server.registerTool(
    "cf_list_access_policies",
    {
      title: "List Access Policies",
      description: `Accessアプリケーションに設定されたポリシー一覧を取得します。

Args:
  - app_id: アプリケーションID`,
      inputSchema: {
        app_id: z.string().min(1).describe("アプリケーションID"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ app_id }) => {
      const data = await cfRequest<CfAccessPolicy[]>("GET", accountPath(`/access/apps/${app_id}/policies`));
      return { content: [{ type: "text", text: formatJson(data.result) }] };
    }
  );

  server.registerTool(
    "cf_get_access_policy",
    {
      title: "Get Access Policy",
      description: `Accessポリシーの詳細を取得します。`,
      inputSchema: {
        app_id: z.string().min(1).describe("アプリケーションID"),
        policy_id: z.string().min(1).describe("ポリシーID"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ app_id, policy_id }) => {
      const data = await cfRequest<CfAccessPolicy>("GET", accountPath(`/access/apps/${app_id}/policies/${policy_id}`));
      return { content: [{ type: "text", text: formatJson(data.result) }] };
    }
  );

  server.registerTool(
    "cf_create_access_policy",
    {
      title: "Create Access Policy",
      description: `Accessアプリケーションにポリシーを追加します。

Args:
  - app_id: アプリケーションID
  - name: ポリシー名（例: "Allow specific emails"）
  - decision: アクション（allow, deny, bypass, non_identity）
  - include: 含めるルール配列（例: [{"email": {"email": "user@example.com"}}]）
  - exclude: 除外ルール配列（オプション）
  - require: 必須ルール配列（オプション）
  - precedence: 優先度（数値が小さいほど高優先度）

ルールの例:
  - メールアドレス: {"email": {"email": "user@example.com"}}
  - メールドメイン: {"email_domain": {"domain": "example.com"}}
  - IPアドレス: {"ip": {"ip": "192.168.1.0/24"}}
  - 全員: {"everyone": {}}`,
      inputSchema: {
        app_id: z.string().min(1).describe("アプリケーションID"),
        name: z.string().min(1).describe("ポリシー名"),
        decision: z.enum(["allow", "deny", "bypass", "non_identity"]).describe("アクション"),
        include: z.array(AccessRuleSchema).min(1).describe("含めるルール配列"),
        exclude: z.array(AccessRuleSchema).optional().describe("除外ルール配列"),
        require: z.array(AccessRuleSchema).optional().describe("必須ルール配列"),
        precedence: z.number().int().min(1).optional().describe("優先度"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ app_id, name, decision, include, exclude, require: req, precedence }) => {
      const body: Record<string, unknown> = { name, decision, include };
      if (exclude) body.exclude = exclude;
      if (req) body.require = req;
      if (precedence) body.precedence = precedence;

      const data = await cfRequest<CfAccessPolicy>("POST", accountPath(`/access/apps/${app_id}/policies`), { body });
      return {
        content: [{
          type: "text",
          text: `✅ Accessポリシーを作成しました。\n\nID: ${data.result.id}\nName: ${data.result.name}\nDecision: ${data.result.decision}\nPrecedence: ${data.result.precedence}`,
        }],
      };
    }
  );

  server.registerTool(
    "cf_update_access_policy",
    {
      title: "Update Access Policy",
      description: `Accessポリシーを更新します。`,
      inputSchema: {
        app_id: z.string().min(1).describe("アプリケーションID"),
        policy_id: z.string().min(1).describe("ポリシーID"),
        name: z.string().optional().describe("新しい名前"),
        decision: z.enum(["allow", "deny", "bypass", "non_identity"]).optional().describe("アクション"),
        include: z.array(AccessRuleSchema).optional().describe("含めるルール配列"),
        exclude: z.array(AccessRuleSchema).optional().describe("除外ルール配列"),
        precedence: z.number().int().min(1).optional().describe("優先度"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ app_id, policy_id, name, decision, include, exclude, precedence }) => {
      const body: Record<string, unknown> = {};
      if (name) body.name = name;
      if (decision) body.decision = decision;
      if (include) body.include = include;
      if (exclude) body.exclude = exclude;
      if (precedence) body.precedence = precedence;

      const data = await cfRequest<CfAccessPolicy>("PUT", accountPath(`/access/apps/${app_id}/policies/${policy_id}`), { body });
      return { content: [{ type: "text", text: `✅ ポリシー '${data.result.name}' を更新しました。` }] };
    }
  );

  server.registerTool(
    "cf_delete_access_policy",
    {
      title: "Delete Access Policy",
      description: `Accessポリシーを削除します。

⚠️ 破壊的操作: confirm: true が必須です。`,
      inputSchema: {
        app_id: z.string().min(1).describe("アプリケーションID"),
        policy_id: z.string().min(1).describe("ポリシーID"),
        confirm: z.boolean().describe("trueを指定して削除を確認"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ app_id, policy_id, confirm }) => {
      requireConfirm(confirm, `ポリシー '${policy_id}' を削除します。`);
      await cfRequest<unknown>("DELETE", accountPath(`/access/apps/${app_id}/policies/${policy_id}`));
      return { content: [{ type: "text", text: `✅ ポリシー ${policy_id} を削除しました。` }] };
    }
  );
}
