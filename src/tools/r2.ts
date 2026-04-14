import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { cfRequest, accountPath, requireConfirm, formatJson } from "../services/cloudflare-client.js";
import type { CfR2Bucket } from "../types.js";

export function registerR2Tools(server: McpServer): void {
  server.registerTool(
    "cf_list_r2_buckets",
    {
      title: "List R2 Buckets",
      description: `R2 Storageバケット一覧を取得します。バケット名、作成日、ロケーションが含まれます。`,
      inputSchema: {
        cursor: z.string().optional().describe("ページネーションカーソル"),
        per_page: z.number().int().min(1).max(1000).default(100).describe("1ページあたりの件数"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ cursor, per_page }) => {
      try {
        const data = await cfRequest<{ buckets: CfR2Bucket[] }>("GET", accountPath("/r2/buckets"), {
          params: { cursor, per_page },
        });
        return { content: [{ type: "text", text: formatJson(data.result) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("10042") || msg.includes("enable R2")) {
          return {
            content: [{
              type: "text",
              text: "⚠️ R2 Storageがこのアカウントで有効化されていません。\n\nCloudflareダッシュボード → R2 Object Storage → 「Get Started」で有効化してください。\nhttps://dash.cloudflare.com/?to=/:account/r2",
            }],
          };
        }
        throw err;
      }
    }
  );

  server.registerTool(
    "cf_create_r2_bucket",
    {
      title: "Create R2 Bucket",
      description: `新しいR2バケットを作成します。

Args:
  - name: バケット名（小文字英数字とハイフンのみ、3-63文字）
  - location_hint: ロケーションヒント（apac, eeur, enam, weur, wnam等）`,
      inputSchema: {
        name: z.string().min(3).max(63).regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/).describe("バケット名"),
        location_hint: z.string().optional().describe("ロケーションヒント（apac, enam等）"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ name, location_hint }) => {
      const body: Record<string, unknown> = { name };
      if (location_hint) body.locationHint = location_hint;
      const data = await cfRequest<CfR2Bucket>("POST", accountPath("/r2/buckets"), { body });
      return {
        content: [{
          type: "text",
          text: `✅ R2バケットを作成しました。\n\nName: ${data.result.name}\nLocation: ${data.result.location || "auto"}`,
        }],
      };
    }
  );

  server.registerTool(
    "cf_get_r2_bucket",
    {
      title: "Get R2 Bucket",
      description: `R2バケットの詳細を取得します。`,
      inputSchema: {
        bucket_name: z.string().min(1).describe("バケット名"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ bucket_name }) => {
      const data = await cfRequest<CfR2Bucket>("GET", accountPath(`/r2/buckets/${bucket_name}`));
      return { content: [{ type: "text", text: formatJson(data.result) }] };
    }
  );

  server.registerTool(
    "cf_delete_r2_bucket",
    {
      title: "Delete R2 Bucket",
      description: `R2バケットを削除します。バケットは空である必要があります。

⚠️ 破壊的操作: confirm: true が必須です。`,
      inputSchema: {
        bucket_name: z.string().min(1).describe("バケット名"),
        confirm: z.boolean().describe("trueを指定して削除を確認"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ bucket_name, confirm }) => {
      requireConfirm(confirm, `R2バケット '${bucket_name}' を削除します。バケットは空である必要があります。`);
      await cfRequest<unknown>("DELETE", accountPath(`/r2/buckets/${bucket_name}`));
      return { content: [{ type: "text", text: `✅ R2バケット '${bucket_name}' を削除しました。` }] };
    }
  );

  server.registerTool(
    "cf_list_r2_objects",
    {
      title: "List R2 Objects",
      description: `R2バケット内のオブジェクト（ファイル）一覧を取得します。S3互換APIのListObjectsV2を使用。

Args:
  - bucket_name: バケット名
  - prefix: プレフィックスフィルタ（フォルダパス的な使い方）
  - delimiter: デリミタ（"/"でフォルダ風の表示）
  - max_keys: 最大件数`,
      inputSchema: {
        bucket_name: z.string().min(1).describe("バケット名"),
        prefix: z.string().optional().describe("プレフィックスフィルタ"),
        delimiter: z.string().optional().describe("デリミタ（'/'でフォルダ風）"),
        max_keys: z.number().int().min(1).max(1000).default(100).describe("最大件数"),
        cursor: z.string().optional().describe("ページネーションカーソル"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ bucket_name, prefix, delimiter, max_keys, cursor }) => {
      // R2 uses S3-compatible API but CF also has a management API for listing
      const params: Record<string, string | number | boolean | undefined> = {
        prefix, delimiter, per_page: max_keys, cursor,
      };
      try {
        const data = await cfRequest<unknown>("GET", accountPath(`/r2/buckets/${bucket_name}/objects`), { params });
        return { content: [{ type: "text", text: formatJson(data.result) }] };
      } catch {
        // Fallback message if the endpoint is not available
        return {
          content: [{
            type: "text",
            text: `R2オブジェクト一覧の取得にはS3互換APIを使用する必要がある場合があります。バケット '${bucket_name}' のS3エンドポイント: https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com/${bucket_name}`,
          }],
        };
      }
    }
  );
}
