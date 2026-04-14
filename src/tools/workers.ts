import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { cfRequest, accountPath, zonePath, requireConfirm, formatJson } from "../services/cloudflare-client.js";
import type { CfWorker, CfWorkerRoute } from "../types.js";

export function registerWorkersTools(server: McpServer): void {
  server.registerTool(
    "cf_list_workers",
    {
      title: "List Workers",
      description: `アカウントのCloudflare Worker一覧を取得します。スクリプト名、作成日、更新日が含まれます。`,
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const data = await cfRequest<CfWorker[]>("GET", accountPath("/workers/scripts"));
      return { content: [{ type: "text", text: formatJson(data.result) }] };
    }
  );

  server.registerTool(
    "cf_get_worker",
    {
      title: "Get Worker Code",
      description: `Workerのソースコードを取得します。

Args:
  - script_name: Worker名`,
      inputSchema: {
        script_name: z.string().min(1).describe("Worker名"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ script_name }) => {
      const token = process.env.CF_API_TOKEN || "";
      const accountId = process.env.CF_ACCOUNT_ID || "";
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${script_name}`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(`Worker '${script_name}' の取得に失敗しました (${res.status})`);
      }
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/javascript") || contentType.includes("text/")) {
        const code = await res.text();
        return { content: [{ type: "text", text: `// Worker: ${script_name}\n\n${code}` }] };
      }
      return { content: [{ type: "text", text: `Worker '${script_name}' はマルチパート形式です。Content-Type: ${contentType}` }] };
    }
  );

  server.registerTool(
    "cf_delete_worker",
    {
      title: "Delete Worker",
      description: `Workerと全関連リソース（バージョン、デプロイメント等）を削除します。

⚠️ 破壊的操作: confirm: true が必須です。`,
      inputSchema: {
        script_name: z.string().min(1).describe("Worker名"),
        confirm: z.boolean().describe("trueを指定して削除を確認"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ script_name, confirm }) => {
      requireConfirm(confirm, `Worker '${script_name}' と全バージョン・デプロイメントを削除します。`);
      await cfRequest<unknown>("DELETE", accountPath(`/workers/scripts/${script_name}`));
      return { content: [{ type: "text", text: `✅ Worker '${script_name}' を削除しました。` }] };
    }
  );

  server.registerTool(
    "cf_list_worker_deployments",
    {
      title: "List Worker Deployments",
      description: `Workerのデプロイメント一覧を取得します。`,
      inputSchema: {
        script_name: z.string().min(1).describe("Worker名"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ script_name }) => {
      const data = await cfRequest<unknown>("GET", accountPath(`/workers/scripts/${script_name}/deployments`));
      return { content: [{ type: "text", text: formatJson(data.result) }] };
    }
  );

  server.registerTool(
    "cf_get_worker_settings",
    {
      title: "Get Worker Settings",
      description: `Workerの設定を取得します。bindings（KV, R2, D1等）、compatibility_date、compatibility_flags等が含まれます。`,
      inputSchema: {
        script_name: z.string().min(1).describe("Worker名"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ script_name }) => {
      const data = await cfRequest<unknown>("GET", accountPath(`/workers/scripts/${script_name}/settings`));
      return { content: [{ type: "text", text: formatJson(data.result) }] };
    }
  );

  server.registerTool(
    "cf_list_worker_routes",
    {
      title: "List Worker Routes",
      description: `ゾーンに設定されたWorkerルート一覧を取得します。各ルートのパターンと紐付けWorker名が含まれます。`,
      inputSchema: {
        zone_id: z.string().min(1).describe("ゾーンID"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ zone_id }) => {
      const data = await cfRequest<CfWorkerRoute[]>("GET", zonePath(zone_id, "/workers/routes"));
      return { content: [{ type: "text", text: formatJson(data.result) }] };
    }
  );

  server.registerTool(
    "cf_get_worker_subdomain",
    {
      title: "Get Workers Subdomain",
      description: `アカウントのworkers.devサブドメインを取得します。`,
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const data = await cfRequest<{ subdomain: string }>("GET", accountPath("/workers/subdomain"));
      return { content: [{ type: "text", text: `workers.devサブドメイン: ${data.result.subdomain}.workers.dev` }] };
    }
  );
}
