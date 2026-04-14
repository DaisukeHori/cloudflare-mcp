# cloudflare-mcp

Cloudflareアカウント管理のための包括的MCPサーバー。Tunnel、DNS、Zone、Registrar、Access、Billing、Workers、Pages、R2、KV、SSL/TLSを統合管理します。

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FDaisukeHori%2Fcloudflare-mcp)

## 特徴

- **69ツール / 16カテゴリ** — Cloudflareの主要サービスを網羅
- **ワークフローツール** — `cf_publish_hostname` でTunnel ingress + CNAME作成を1発実行
- **安全装置** — 全破壊的操作に `confirm: true` 必須
- **Vercelデプロイ** — Serverless Functionとして動作、コールドスタート高速
- **Claude.ai対応** — コネクタとして登録可能

## クイックスタート

### 1. Cloudflare APIトークン作成

[Cloudflareダッシュボード](https://dash.cloudflare.com/profile/api-tokens) で以下の権限を持つカスタムトークンを作成:

| カテゴリ | 権限 | スコープ |
|---|---|---|
| Account > Cloudflare Tunnel | Edit | 対象アカウント |
| Account > Access: Apps and Policies | Edit | 対象アカウント |
| Account > Workers Scripts | Edit | 対象アカウント |
| Account > Workers KV Storage | Edit | 対象アカウント |
| Account > Workers R2 Storage | Edit | 対象アカウント |
| Account > Cloudflare Pages | Edit | 対象アカウント |
| Account > Account Settings | Read | 対象アカウント |
| Account > Billing | Read | 対象アカウント |
| Zone > Zone | Read | 全ゾーン |
| Zone > DNS | Edit | 全ゾーン |
| Zone > SSL and Certificates | Read | 全ゾーン |

### 2. デプロイ

```bash
# リポジトリをクローン
git clone https://github.com/DaisukeHori/cloudflare-mcp.git
cd cloudflare-mcp

# 依存関係インストール
npm install

# ビルド
npm run build

# Vercelにデプロイ
npx vercel --prod
```

### 3. 環境変数設定（Vercel）

| 変数名 | 値 |
|---|---|
| `MCP_API_KEY` | 任意のAPIキー（例: `cfmcp-` + ランダム文字列） |
| `CF_API_TOKEN` | Step 1で作成したCloudflareトークン |
| `CF_ACCOUNT_ID` | CloudflareアカウントID |

### 4. Claude.aiコネクタ登録

Claude.aiの設定 > 接続 > カスタムMCPサーバーに以下を追加:

```
https://cloudflare-mcp.vercel.app/api/mcp?key=YOUR_MCP_API_KEY
```

## ツール一覧

### Phase 1（実装済み: 26ツール）

#### アカウント管理
| ツール | 説明 |
|---|---|
| `cf_list_accounts` | アカウント一覧 |
| `cf_get_account` | アカウント詳細 |
| `cf_list_account_members` | メンバー一覧 |
| `cf_get_user` | 現在のユーザー情報 |

#### ゾーン管理
| ツール | 説明 |
|---|---|
| `cf_list_zones` | ゾーン（ドメイン）一覧 |
| `cf_get_zone` | ゾーン詳細 |
| `cf_create_zone` | ゾーン追加 |
| `cf_delete_zone` | ゾーン削除 ⚠️ |
| `cf_get_zone_settings` | ゾーン設定一覧 |

#### DNS管理
| ツール | 説明 |
|---|---|
| `cf_list_dns_records` | DNSレコード一覧 |
| `cf_create_dns_record` | レコード作成 |
| `cf_update_dns_record` | レコード更新 |
| `cf_delete_dns_record` | レコード削除 ⚠️ |

#### Tunnel管理
| ツール | 説明 |
|---|---|
| `cf_list_tunnels` | トンネル一覧 |
| `cf_get_tunnel` | トンネル詳細 |
| `cf_create_tunnel` | トンネル作成 |
| `cf_update_tunnel` | トンネル名変更 |
| `cf_delete_tunnel` | トンネル削除 ⚠️ |
| `cf_get_tunnel_token` | cloudflared起動用トークン取得 |

#### Tunnel設定
| ツール | 説明 |
|---|---|
| `cf_get_tunnel_config` | Ingress設定取得 |
| `cf_update_tunnel_config` | Ingress設定更新 |

#### Tunnel接続
| ツール | 説明 |
|---|---|
| `cf_list_tunnel_connections` | アクティブ接続一覧 |
| `cf_clean_tunnel_connections` | 全接続強制切断 ⚠️ |

#### ワークフロー
| ツール | 説明 |
|---|---|
| `cf_publish_hostname` | Tunnel公開（ingress + CNAME一括） |
| `cf_unpublish_hostname` | 公開解除（ingress + CNAME削除） ⚠️ |
| `cf_tunnel_status_summary` | 全Tunnelヘルスサマリー |

⚠️ = 破壊的操作（`confirm: true` 必須）

### Phase 2（開発予定: 19ツール）
- Billing（4）: 請求プロフィール、履歴、サブスクリプション、利用量
- Registrar（3）: ドメイン一覧、詳細、設定変更
- Access（10）: Application CRUD、Policy CRUD
- SSL/TLS（2）: SSL設定、証明書一覧

### Phase 3（開発予定: 24ツール）
- Workers（7）: 一覧、コード取得、削除、デプロイメント、設定、ルート
- Pages（7）: プロジェクトCRUD、デプロイ、ロールバック
- R2（5）: バケットCRUD、オブジェクト一覧
- KV（5）: Namespace CRUD、キー一覧、値取得

## 使用例

### Tunnelの状態を確認
```
「Tunnelの状態を全部見せて」
→ cf_tunnel_status_summary()
```

### 新サービスをTunnel経由で公開
```
「ssh-mcp.appserver.tokyoをlocalhost:3000に公開して」
→ cf_publish_hostname(tunnel_id, "ssh-mcp.appserver.tokyo", "http://localhost:3000")
```

### DNSレコード追加
```
「appserver.tokyoにAレコードを追加して」
→ cf_create_dns_record(zone_id, "A", "sub", "1.2.3.4", proxied=true)
```

## ローカル開発

```bash
# 環境変数設定
export MCP_API_KEY=cfmcp-test-key
export CF_API_TOKEN=your_cloudflare_token
export CF_ACCOUNT_ID=your_account_id

# HTTP モードで起動
npm run dev

# MCP Inspectorでテスト
npx @modelcontextprotocol/inspector -t http -u "http://localhost:3000/api/mcp?key=cfmcp-test-key"
```

## アーキテクチャ

```
Claude.ai / MCP Client
        │
        ▼
  Vercel Serverless Function
  (api/mcp.ts)
        │
        ├── ?key= 認証
        │
        ▼
  McpServer (src/server.ts)
        │
        ├── tools/account.ts
        ├── tools/zones.ts
        ├── tools/dns.ts
        ├── tools/tunnel.ts
        ├── tools/tunnel-config.ts
        ├── tools/tunnel-connections.ts
        └── tools/workflows.ts
              │
              ▼
        Cloudflare API v4
        (api.cloudflare.com)
```

## ライセンス

MIT

---
_Deployed on 2026-04-14_
