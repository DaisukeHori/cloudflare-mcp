import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { cfRequest, accountPath, requireConfirm, formatJson } from "../services/cloudflare-client.js";
import type { CfZone, CfDnsRecord, CfTunnel, CfTunnelConfig, CfTunnelIngress } from "../types.js";

// ── Helpers ──────────────────────────────────────────────────────────

async function findZoneByHostname(hostname: string): Promise<CfZone> {
  // hostname "sub.appserver.tokyo" → try "appserver.tokyo", then "sub.appserver.tokyo"
  const parts = hostname.split(".");
  for (let i = 1; i < parts.length; i++) {
    const candidate = parts.slice(i).join(".");
    if (candidate.includes(".")) {
      const data = await cfRequest<CfZone[]>("GET", "/zones", { params: { name: candidate, per_page: 1 } });
      if (data.result.length > 0) return data.result[0];
    }
  }
  // Also try the full hostname in case it IS the zone
  const data = await cfRequest<CfZone[]>("GET", "/zones", { params: { name: hostname, per_page: 1 } });
  if (data.result.length > 0) return data.result[0];

  throw new Error(`ホスト名 '${hostname}' に対応するゾーンが見つかりません。Cloudflareに登録済みのドメインを確認してください。`);
}

async function getTunnelConfig(tunnelId: string): Promise<CfTunnelConfig> {
  const data = await cfRequest<CfTunnelConfig>("GET", accountPath(`/cfd_tunnel/${tunnelId}/configurations`));
  return data.result;
}

async function updateTunnelConfig(tunnelId: string, config: CfTunnelConfig["config"]): Promise<void> {
  await cfRequest<CfTunnelConfig>("PUT", accountPath(`/cfd_tunnel/${tunnelId}/configurations`), {
    body: { config },
  });
}

// ── Tool Registrations ───────────────────────────────────────────────

export function registerWorkflowTools(server: McpServer): void {
  // ── cf_publish_hostname ──────────────────────────────────────────
  server.registerTool(
    "cf_publish_hostname",
    {
      title: "Publish Hostname via Tunnel",
      description: `Tunnelにホスト名を公開する一括処理。以下を1ステップで実行します:

1. ホスト名からゾーンを自動特定
2. 現在のTunnel ingress設定を取得
3. 新しいingressルール追加（catch-allの前に挿入）
4. Tunnel設定を更新
5. CNAMEレコード作成（hostname → tunnel_id.cfargotunnel.com）

Args:
  - tunnel_id: 対象トンネルのID
  - hostname: 公開するホスト名（例: "ssh-mcp.appserver.tokyo"）
  - service: ローカルサービスURL（例: "http://localhost:3000"）
  - path: パスプレフィックス（オプション）
  - no_tls_verify: TLS検証スキップ（自己署名証明書の場合true）
  - proxied: CloudflareプロキシをCNAMEに適用するか`,
      inputSchema: {
        tunnel_id: z.string().min(1).describe("トンネルID"),
        hostname: z.string().min(1).describe("公開ホスト名（例: 'ssh-mcp.appserver.tokyo'）"),
        service: z.string().min(1).describe("ローカルサービスURL（例: 'http://localhost:3000'）"),
        path: z.string().optional().describe("パスプレフィックス"),
        no_tls_verify: z.boolean().default(false).describe("TLS検証スキップ"),
        proxied: z.boolean().default(true).describe("CloudflareプロキシをCNAMEに適用"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ tunnel_id, hostname, service, path, no_tls_verify, proxied }) => {
      const steps: string[] = [];

      // Step 1: ゾーン特定
      const zone = await findZoneByHostname(hostname);
      steps.push(`✅ ゾーン特定: ${zone.name} (${zone.id})`);

      // Step 2-3: Ingress追加
      const currentConfig = await getTunnelConfig(tunnel_id);
      const ingress = [...(currentConfig.config.ingress || [])];

      // 重複チェック
      const exists = ingress.some((r) => r.hostname === hostname);
      if (exists) {
        throw new Error(`ホスト名 '${hostname}' は既にこのトンネルのingressに存在します。`);
      }

      // catch-allの前に挿入
      const newRule: CfTunnelIngress = { hostname, service };
      if (path) newRule.path = path;
      if (no_tls_verify) newRule.originRequest = { noTLSVerify: true };

      const catchAllIndex = ingress.findIndex((r) => !r.hostname);
      if (catchAllIndex >= 0) {
        ingress.splice(catchAllIndex, 0, newRule);
      } else {
        // catch-allがない場合、追加してからデフォルトを付与
        ingress.push(newRule);
        ingress.push({ service: "http_status:404" });
      }

      // Step 4: Tunnel設定更新
      await updateTunnelConfig(tunnel_id, {
        ...currentConfig.config,
        ingress,
      });
      steps.push(`✅ Ingress追加: ${hostname} → ${service}`);

      // Step 5: CNAME作成
      try {
        const cname = await cfRequest<CfDnsRecord>("POST", `/zones/${zone.id}/dns_records`, {
          body: {
            type: "CNAME",
            name: hostname,
            content: `${tunnel_id}.cfargotunnel.com`,
            proxied,
            ttl: 1,
            comment: `Managed by cloudflare-mcp: Tunnel ${tunnel_id}`,
          },
        });
        steps.push(`✅ CNAME作成: ${cname.result.name} → ${cname.result.content}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("already exists")) {
          steps.push(`ℹ️ CNAME既存: ${hostname} のCNAMEレコードは既に存在します`);
        } else {
          steps.push(`⚠️ CNAME作成失敗: ${msg}`);
        }
      }

      return {
        content: [{
          type: "text",
          text: `🚀 ホスト名を公開しました。\n\n${steps.join("\n")}\n\nURL: https://${hostname}`,
        }],
      };
    }
  );

  // ── cf_unpublish_hostname ────────────────────────────────────────
  server.registerTool(
    "cf_unpublish_hostname",
    {
      title: "Unpublish Hostname from Tunnel",
      description: `Tunnelからホスト名の公開を解除する一括処理。以下を1ステップで実行:

1. Tunnel ingress設定からホスト名を除去
2. 対応するCNAMEレコードを削除

⚠️ 破壊的操作: confirm: true が必須です。`,
      inputSchema: {
        tunnel_id: z.string().min(1).describe("トンネルID"),
        hostname: z.string().min(1).describe("公開解除するホスト名"),
        confirm: z.boolean().describe("trueを指定して実行を確認"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ tunnel_id, hostname, confirm }) => {
      requireConfirm(confirm, `ホスト名 '${hostname}' の公開を解除し、ingress設定とCNAMEレコードを削除します。`);
      const steps: string[] = [];

      // Step 1: Ingress除去
      const currentConfig = await getTunnelConfig(tunnel_id);
      const ingress = (currentConfig.config.ingress || []).filter((r) => r.hostname !== hostname);

      if (ingress.length === currentConfig.config.ingress.length) {
        steps.push(`ℹ️ Ingressに '${hostname}' は見つかりませんでした`);
      } else {
        await updateTunnelConfig(tunnel_id, { ...currentConfig.config, ingress });
        steps.push(`✅ Ingress除去: ${hostname}`);
      }

      // Step 2: CNAME削除
      try {
        const zone = await findZoneByHostname(hostname);
        const records = await cfRequest<CfDnsRecord[]>("GET", `/zones/${zone.id}/dns_records`, {
          params: { type: "CNAME", name: hostname },
        });
        for (const record of records.result) {
          await cfRequest<unknown>("DELETE", `/zones/${zone.id}/dns_records/${record.id}`);
          steps.push(`✅ CNAME削除: ${record.name}`);
        }
        if (records.result.length === 0) {
          steps.push(`ℹ️ CNAMEレコードは見つかりませんでした`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        steps.push(`⚠️ CNAME削除: ${msg}`);
      }

      return {
        content: [{
          type: "text",
          text: `🔒 ホスト名の公開を解除しました。\n\n${steps.join("\n")}`,
        }],
      };
    }
  );

  // ── cf_tunnel_status_summary ─────────────────────────────────────
  server.registerTool(
    "cf_tunnel_status_summary",
    {
      title: "Tunnel Status Summary",
      description: `全Tunnelのヘルスサマリーを表示します。各トンネルの名前、ステータス、接続数、公開ホスト名を一覧化します。

Args:
  - name: トンネル名フィルタ（部分一致）
  - status: ステータスフィルタ`,
      inputSchema: {
        name: z.string().optional().describe("トンネル名フィルタ"),
        status: z.enum(["healthy", "degraded", "down", "inactive"]).optional().describe("ステータスフィルタ"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ name, status }) => {
      // Tunnel一覧取得
      const tunnelsData = await cfRequest<CfTunnel[]>("GET", accountPath("/cfd_tunnel"), {
        params: { name, status, is_deleted: false, per_page: 100 },
      });

      const summaries: Array<Record<string, unknown>> = [];

      // 各トンネルのconfig取得（並列）
      const configPromises = tunnelsData.result.map(async (tunnel) => {
        try {
          const config = await getTunnelConfig(tunnel.id);
          const hostnames = (config.config.ingress || [])
            .filter((r) => r.hostname)
            .map((r) => ({ hostname: r.hostname, service: r.service, path: r.path }));

          return {
            name: tunnel.name,
            id: tunnel.id,
            status: tunnel.status,
            connections: tunnel.connections?.length ?? 0,
            hostnames,
            created_at: tunnel.created_at,
          };
        } catch {
          return {
            name: tunnel.name,
            id: tunnel.id,
            status: tunnel.status,
            connections: tunnel.connections?.length ?? 0,
            hostnames: [],
            config_error: "設定取得失敗",
          };
        }
      });

      const results = await Promise.all(configPromises);
      summaries.push(...results);

      // テキストサマリー生成
      const lines = summaries.map((s) => {
        const statusIcon = s.status === "healthy" ? "🟢" : s.status === "degraded" ? "🟡" : s.status === "inactive" ? "⚪" : "🔴";
        const hosts = (s.hostnames as Array<Record<string, string>>);
        const hostList = hosts.length > 0
          ? hosts.map((h) => `    ${h.hostname} → ${h.service}`).join("\n")
          : "    (公開ホスト名なし)";
        return `${statusIcon} ${s.name} [${s.status}] — 接続数: ${s.connections}\n${hostList}`;
      });

      return {
        content: [{
          type: "text",
          text: `📊 Tunnel Status Summary\n\n合計: ${summaries.length} トンネル\n\n${lines.join("\n\n")}`,
        }],
      };
    }
  );
}
