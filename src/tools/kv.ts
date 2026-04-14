import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { cfRequest, accountPath, requireConfirm, formatJson } from "../services/cloudflare-client.js";
import type { CfKvNamespace, CfKvKey } from "../types.js";

export function registerKvTools(server: McpServer): void {
  server.registerTool(
    "cf_list_kv_namespaces",
    {
      title: "List KV Namespaces",
      description: `Workers KV Namespace一覧を取得します。各NamespaceのID、タイトルが含まれます。`,
      inputSchema: {
        page: z.number().int().min(1).default(1).describe("ページ番号"),
        per_page: z.number().int().min(5).max(100).default(20).describe("1ページあたりの件数"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ page, per_page }) => {
      const data = await cfRequest<CfKvNamespace[]>("GET", accountPath("/storage/kv/namespaces"), {
        params: { page, per_page },
      });
      return { content: [{ type: "text", text: formatJson(data.result) }] };
    }
  );

  server.registerTool(
    "cf_create_kv_namespace",
    {
      title: "Create KV Namespace",
      description: `新しいKV Namespaceを作成します。

Args:
  - title: Namespace名（Worker bindingで使用する名前）`,
      inputSchema: {
        title: z.string().min(1).describe("Namespace名"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ title }) => {
      const data = await cfRequest<CfKvNamespace>("POST", accountPath("/storage/kv/namespaces"), {
        body: { title },
      });
      return {
        content: [{
          type: "text",
          text: `✅ KV Namespaceを作成しました。\n\nID: ${data.result.id}\nTitle: ${data.result.title}`,
        }],
      };
    }
  );

  server.registerTool(
    "cf_delete_kv_namespace",
    {
      title: "Delete KV Namespace",
      description: `KV Namespaceと格納されている全キー/値を削除します。

⚠️ 破壊的操作: confirm: true が必須です。`,
      inputSchema: {
        namespace_id: z.string().min(1).describe("Namespace ID"),
        confirm: z.boolean().describe("trueを指定して削除を確認"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ namespace_id, confirm }) => {
      requireConfirm(confirm, `KV Namespace '${namespace_id}' と全キー/値を削除します。`);
      await cfRequest<unknown>("DELETE", accountPath(`/storage/kv/namespaces/${namespace_id}`));
      return { content: [{ type: "text", text: `✅ KV Namespace ${namespace_id} を削除しました。` }] };
    }
  );

  server.registerTool(
    "cf_list_kv_keys",
    {
      title: "List KV Keys",
      description: `KV Namespace内のキー一覧を取得します。キー名、有効期限、メタデータが含まれます。

Args:
  - namespace_id: Namespace ID
  - prefix: プレフィックスフィルタ
  - limit: 最大件数（デフォルト: 100、最大: 1000）
  - cursor: ページネーションカーソル`,
      inputSchema: {
        namespace_id: z.string().min(1).describe("Namespace ID"),
        prefix: z.string().optional().describe("プレフィックスフィルタ"),
        limit: z.number().int().min(1).max(1000).default(100).describe("最大件数"),
        cursor: z.string().optional().describe("ページネーションカーソル"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ namespace_id, prefix, limit, cursor }) => {
      const data = await cfRequest<CfKvKey[]>("GET", accountPath(`/storage/kv/namespaces/${namespace_id}/keys`), {
        params: { prefix, limit, cursor },
      });
      return { content: [{ type: "text", text: formatJson(data.result) }] };
    }
  );

  server.registerTool(
    "cf_get_kv_value",
    {
      title: "Get KV Value",
      description: `KVキーの値を取得します。値はテキストとして返されます。

Args:
  - namespace_id: Namespace ID
  - key_name: キー名`,
      inputSchema: {
        namespace_id: z.string().min(1).describe("Namespace ID"),
        key_name: z.string().min(1).describe("キー名"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ namespace_id, key_name }) => {
      const token = process.env.CF_API_TOKEN || "";
      const accountId = process.env.CF_ACCOUNT_ID || "";
      const encodedKey = encodeURIComponent(key_name);
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespace_id}/values/${encodedKey}`,
        { headers: { "Authorization": `Bearer ${token}` } }
      );
      if (!res.ok) {
        throw new Error(`KVキー '${key_name}' の取得に失敗しました (${res.status})`);
      }
      const value = await res.text();
      return { content: [{ type: "text", text: `Key: ${key_name}\nValue:\n${value}` }] };
    }
  );
}
