import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { cfRequest, zonePath, requireConfirm, formatJson } from "../services/cloudflare-client.js";
import type { CfDnsRecord } from "../types.js";

export function registerDnsTools(server: McpServer): void {
  // ── cf_list_dns_records ──────────────────────────────────────────
  server.registerTool(
    "cf_list_dns_records",
    {
      title: "List DNS Records",
      description: `ゾーンのDNSレコード一覧を取得します。

Args:
  - zone_id: ゾーンID（cf_list_zonesで取得）
  - type: レコードタイプでフィルタ（A, AAAA, CNAME, MX, TXT, NS, SRV等）
  - name: レコード名でフィルタ（完全一致、例: "sub.example.com"）
  - content: コンテンツでフィルタ（完全一致）`,
      inputSchema: {
        zone_id: z.string().min(1).describe("ゾーンID"),
        type: z.string().optional().describe("レコードタイプ（A, AAAA, CNAME, MX, TXT等）"),
        name: z.string().optional().describe("レコード名フィルタ（完全一致）"),
        content: z.string().optional().describe("コンテンツフィルタ（完全一致）"),
        page: z.number().int().min(1).default(1).describe("ページ番号"),
        per_page: z.number().int().min(5).max(100).default(50).describe("1ページあたりの件数"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ zone_id, type, name, content, page, per_page }) => {
      const data = await cfRequest<CfDnsRecord[]>("GET", zonePath(zone_id, "/dns_records"), {
        params: { type, name, content, page, per_page },
      });
      const records = data.result.map((r) => ({
        id: r.id,
        type: r.type,
        name: r.name,
        content: r.content,
        proxied: r.proxied,
        ttl: r.ttl,
        comment: r.comment,
      }));
      const info = data.result_info;
      return {
        content: [{
          type: "text",
          text: formatJson({ total_count: info?.total_count, count: records.length, page: info?.page, records }),
        }],
      };
    }
  );

  // ── cf_create_dns_record ─────────────────────────────────────────
  server.registerTool(
    "cf_create_dns_record",
    {
      title: "Create DNS Record",
      description: `DNSレコードを作成します。

Args:
  - zone_id: ゾーンID
  - type: レコードタイプ（A, AAAA, CNAME, MX, TXT, NS, SRV等）
  - name: レコード名（例: "sub" で sub.example.com、"@" でルート）
  - content: 値（AならIPアドレス、CNAMEなら対象ホスト名等）
  - proxied: Cloudflareプロキシ有効化（デフォルト: false）
  - ttl: TTL秒数（1=Auto、proxied=trueの場合は自動で1）
  - priority: MXレコードの優先度
  - comment: コメント`,
      inputSchema: {
        zone_id: z.string().min(1).describe("ゾーンID"),
        type: z.string().min(1).describe("レコードタイプ（A, AAAA, CNAME, MX, TXT等）"),
        name: z.string().min(1).describe("レコード名（例: 'sub', '@'）"),
        content: z.string().min(1).describe("レコードの値"),
        proxied: z.boolean().default(false).describe("Cloudflareプロキシを有効にするか"),
        ttl: z.number().int().min(1).default(1).describe("TTL秒数（1=Auto）"),
        priority: z.number().int().optional().describe("MXレコードの優先度"),
        comment: z.string().optional().describe("コメント"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ zone_id, type, name, content, proxied, ttl, priority, comment }) => {
      const body: Record<string, unknown> = { type, name, content, proxied, ttl };
      if (priority !== undefined) body.priority = priority;
      if (comment) body.comment = comment;

      const data = await cfRequest<CfDnsRecord>("POST", zonePath(zone_id, "/dns_records"), { body });
      return {
        content: [{
          type: "text",
          text: `✅ DNSレコードを作成しました。\n\nID: ${data.result.id}\nType: ${data.result.type}\nName: ${data.result.name}\nContent: ${data.result.content}\nProxied: ${data.result.proxied}\nTTL: ${data.result.ttl}`,
        }],
      };
    }
  );

  // ── cf_update_dns_record ─────────────────────────────────────────
  server.registerTool(
    "cf_update_dns_record",
    {
      title: "Update DNS Record",
      description: `既存のDNSレコードを更新します。指定したフィールドのみ変更されます。

Args:
  - zone_id: ゾーンID
  - record_id: レコードID（cf_list_dns_recordsで取得）
  - content: 新しい値
  - proxied: プロキシ設定変更
  - ttl: TTL変更
  - comment: コメント変更`,
      inputSchema: {
        zone_id: z.string().min(1).describe("ゾーンID"),
        record_id: z.string().min(1).describe("レコードID"),
        content: z.string().optional().describe("新しい値"),
        proxied: z.boolean().optional().describe("プロキシ有効/無効"),
        ttl: z.number().int().min(1).optional().describe("TTL秒数"),
        comment: z.string().optional().describe("コメント"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ zone_id, record_id, content, proxied, ttl, comment }) => {
      const body: Record<string, unknown> = {};
      if (content !== undefined) body.content = content;
      if (proxied !== undefined) body.proxied = proxied;
      if (ttl !== undefined) body.ttl = ttl;
      if (comment !== undefined) body.comment = comment;

      const data = await cfRequest<CfDnsRecord>("PATCH", zonePath(zone_id, `/dns_records/${record_id}`), { body });
      return {
        content: [{
          type: "text",
          text: `✅ DNSレコードを更新しました。\n\nID: ${data.result.id}\nType: ${data.result.type}\nName: ${data.result.name}\nContent: ${data.result.content}\nProxied: ${data.result.proxied}`,
        }],
      };
    }
  );

  // ── cf_delete_dns_record ─────────────────────────────────────────
  server.registerTool(
    "cf_delete_dns_record",
    {
      title: "Delete DNS Record",
      description: `DNSレコードを削除します。

⚠️ 破壊的操作: confirm: true が必須です。`,
      inputSchema: {
        zone_id: z.string().min(1).describe("ゾーンID"),
        record_id: z.string().min(1).describe("レコードID"),
        confirm: z.boolean().describe("trueを指定して削除を確認"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ zone_id, record_id, confirm }) => {
      requireConfirm(confirm, `DNSレコード '${record_id}' を削除します。`);
      const data = await cfRequest<{ id: string }>("DELETE", zonePath(zone_id, `/dns_records/${record_id}`));
      return { content: [{ type: "text", text: `✅ DNSレコード ${data.result.id} を削除しました。` }] };
    }
  );
}
