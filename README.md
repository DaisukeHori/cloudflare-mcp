# Cloudflare MCP Server

**AIをCloudflareインフラ管理者にする。**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FDaisukeHori%2Fcloudflare-mcp&env=MCP_API_KEY%2CCF_API_TOKEN%2CCF_ACCOUNT_ID&project-name=cloudflare-mcp&repository-name=cloudflare-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> **エンドポイント:** `https://cloudflare-mcp.vercel.app/api/mcp`

「Tunnelの状態を見せて」「ssh-mcp.appserver.tokyoをTunnel経由で公開して」と言うだけで、Tunnel ingress設定・CNAME作成・Access保護まで一括実行します。

69のMCPツール × 16カテゴリで、Tunnel・DNS・Zone・Registrar・Access・Billing・Workers・Pages・R2・KV・SSLをCloudflareダッシュボードを開かずにAIから直接操作できます。

## なぜ必要か

Cloudflare公式のMCPコネクタ（`bindings.mcp.cloudflare.com`）は存在しますが、**KV・Workers・R2のごく基本的な操作しかできません**。

実際のCloudflareインフラ管理には：
- 「Tunnelを作成してingressを設定してCNAMEも作ってAccessで保護」という**複数リソースの連携**が必要
- 「ドメインの有効期限が近いものを確認」「今月の請求額を確認」という**運用監視**が必要
- 「Workers/Pagesのデプロイ状況を確認してロールバック」という**デプロイ管理**が必要

このMCPサーバーは、これらを**69ツールでフルカバー**し、さらに複数API呼び出しを束ねた**ワークフローツール**で1コマンド操作を実現します。

**公式コネクタは接続不要です。** 本MCPが公式の全機能を包含しているため、両方接続するとツールが重複して混乱します。

## アーキテクチャ

```
┌──────────────────────────────────────────┐
│  ワークフローツール（3ツール）              │
│  cf_publish_hostname / unpublish / summary │
│  ingress + DNS + Access を一括操作          │
├──────────────────────────────────────────┤
│  API操作ツール（66ツール / 15カテゴリ）     │
│  Tunnel(10) DNS(4) Zone(5) Access(10)     │
│  Workers(7) Pages(7) R2(5) KV(5)          │
│  Billing(4) Registrar(3) SSL(2) Account(4) │
├──────────────────────────────────────────┤
│  Cloudflare API v4 クライアント            │
│  エラーハンドリング / レート制限対応          │
│  破壊的操作の安全装置（confirm必須）         │
└──────────────────────────────────────────┘
```

## 使用例

```
ユーザー: 「Tunnelの状態を全部見せて」

AI: cf_tunnel_status_summary を実行します。

    📊 Tunnel Status Summary — 合計: 3トンネル

    🟢 ccp-proxmox [healthy] — 接続数: 2
        proxmox.appserver.tokyo → https://192.168.70.226:8006
        ccp.appserver.tokyo → http://localhost:3000

    🟢 revol-web [healthy] — 接続数: 1
        www.revol.co.jp → http://localhost:8080

    ⚪ test-tunnel [inactive] — 接続数: 0
        (公開ホスト名なし)
```

```
ユーザー: 「ssh-mcp.appserver.tokyoをlocalhost:3000に公開して」

AI: cf_publish_hostname を実行します。

    🚀 ホスト名を公開しました。

    ✅ ゾーン特定: appserver.tokyo (abc123)
    ✅ Ingress追加: ssh-mcp.appserver.tokyo → http://localhost:3000
    ✅ CNAME作成: ssh-mcp.appserver.tokyo → tunnel-id.cfargotunnel.com

    URL: https://ssh-mcp.appserver.tokyo
```

## 🔒 セキュリティ

**Q: 公開エンドポイントにCloudflareトークンを送っても大丈夫？**

- 通信は全て **HTTPS（TLS暗号化）** で保護されます
- サーバーは**ステートレス**です。トークンはVercel環境変数に保存され、リクエスト処理中にのみ使用されます
- MCP接続には **API Key認証**（`?key=`パラメータ）が必須です
- ソースコードは**全て公開**されています
- 全ての**破壊的操作に `confirm: true` が必須**です

## クイックスタート（3ステップ）

### ステップ1: Cloudflare APIトークンを作成

[Cloudflareダッシュボード](https://dash.cloudflare.com/profile/api-tokens) → API Tokens → Create Token → **Custom Token**

**必要な権限:**

| カテゴリ | リソース | 権限 | 用途 |
|:--|:--|:--|:--|
| Account | Cloudflare Tunnel | Edit | Tunnel CRUD・ingress・接続管理 |
| Account | Access: Apps and Policies | Edit | Accessアプリ・ポリシー |
| Account | Workers Scripts | Edit | Workers管理 |
| Account | Workers KV Storage | Edit | KV管理 |
| Account | Workers R2 Storage | Edit | R2バケット管理 |
| Account | Cloudflare Pages | Edit | Pages管理 |
| Account | Account Settings | Read | アカウント情報・メンバー |
| Account | Billing | Read | 課金情報 |
| Zone | Zone | Read | ゾーン一覧 |
| Zone | Zone Settings | Read | ゾーン設定 |
| Zone | DNS | Edit | DNSレコード管理 |
| Zone | SSL and Certificates | Read | SSL証明書 |

**Account Resources:** `Include > All accounts`
**Zone Resources:** `Include > All zones`

> 使わないカテゴリの権限は省略可能。対応ツール呼び出し時にのみ権限が必要です。

### ステップ2: デプロイ

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FDaisukeHori%2Fcloudflare-mcp&env=MCP_API_KEY%2CCF_API_TOKEN%2CCF_ACCOUNT_ID&project-name=cloudflare-mcp&repository-name=cloudflare-mcp)

| 環境変数 | 値 |
|:--|:--|
| `MCP_API_KEY` | `cfmcp-` + ランダム文字列 |
| `CF_API_TOKEN` | ステップ1で作成したトークン |
| `CF_ACCOUNT_ID` | CloudflareアカウントID |

### ステップ3: MCPサーバーを接続

**Claude.ai:** Settings → MCP → Add Server:
```
https://cloudflare-mcp.vercel.app/api/mcp?key=YOUR_MCP_API_KEY
```

**Claude Desktop / Cursor:**
```json
{
  "mcpServers": {
    "cloudflare": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://cloudflare-mcp.vercel.app/api/mcp?key=YOUR_MCP_API_KEY"]
    }
  }
}
```

**Claude Code:**
```bash
claude mcp add --transport http cloudflare \
  "https://cloudflare-mcp.vercel.app/api/mcp?key=YOUR_MCP_API_KEY"
```

## ⚠️ 重要な注意事項

### 破壊的操作（11ツール）

`confirm: true` 必須。省略すると実行されません。

| ツール | 影響 |
|:--|:--|
| `cf_delete_zone` | ゾーンと全DNS・設定が消失 |
| `cf_delete_dns_record` | DNSレコード削除 |
| `cf_delete_tunnel` | トンネル削除。cloudflaredは切断 |
| `cf_clean_tunnel_connections` | 全接続を強制切断 |
| `cf_delete_access_app` | Accessアプリと関連ポリシーを削除 |
| `cf_delete_access_policy` | Accessポリシーを削除 |
| `cf_delete_worker` | Worker + 全バージョン削除 |
| `cf_delete_pages_project` | Pages + 全デプロイ削除 |
| `cf_delete_r2_bucket` | R2バケット削除（空であること） |
| `cf_delete_kv_namespace` | KV + 全キー/値削除 |
| `cf_unpublish_hostname` | ingress除去 + CNAME削除 |

### Tunnel設定の全体置換

`cf_update_tunnel_config` は **PUT（全体置換）**。既存設定を維持する場合は先に `cf_get_tunnel_config` で取得してください。

### APIレート制限

Cloudflare: 1,200 req / 5分。`cf_tunnel_status_summary` は内部で複数APIを呼ぶため注意。

## 公式コネクタとの関係

**公式コネクタ（bindings.mcp）は接続不要。本MCPが全機能を包含。**

| 機能 | 公式 | 本MCP |
|:--|:--|:--|
| Tunnel管理 | ❌ | ✅ CRUD + ingress + 接続 + token |
| DNS管理 | ❌ | ✅ CRUD |
| Zone管理 | ❌ | ✅ CRUD + 設定 |
| Access | ❌ | ✅ App + Policy CRUD |
| Billing | ❌ | ✅ プロフィール・履歴・サブスク |
| Registrar | ❌ | ✅ 一覧・詳細・更新 |
| Workers | △ 一覧+コード取得のみ | ✅ + デプロイ・設定・ルート |
| KV | △ Namespace CRUDのみ | ✅ + キー一覧・値取得 |
| R2 | △ バケットのみ | ✅ + オブジェクト一覧 |
| Pages | ❌ | ✅ プロジェクト + デプロイ + ロールバック |
| SSL/TLS | ❌ | ✅ 設定・証明書 |
| ワークフロー | ❌ | ✅ publish / unpublish / summary |

## ツール一覧（69ツール / 16カテゴリ）

| カテゴリ | ツール数 | 主な操作 |
|:--|:--|:--|
| Tunnel CRUD | 6 | list / get / create / update / delete / token |
| Tunnel設定 | 2 | get_config / update_config |
| Tunnel接続 | 2 | list_connections / clean_connections |
| DNS | 4 | list / create / update / delete |
| ゾーン | 5 | list / get / create / delete / settings |
| アカウント | 4 | list / get / members / user |
| 課金 | 4 | profile / history / subscriptions / usage |
| Registrar | 3 | list / get / update |
| Access Apps | 5 | list / get / create / update / delete |
| Access Policies | 5 | list / get / create / update / delete |
| Workers | 7 | list / get / delete / deployments / settings / routes / subdomain |
| Pages | 7 | list / get / create / delete / deployments / deploy / rollback |
| R2 | 5 | list / create / get / delete / objects |
| KV | 5 | list / create / delete / keys / value |
| SSL | 2 | setting / certificates |
| ワークフロー | 3 | publish / unpublish / summary |

## FAQ

**Q: 公式コネクタは使わなくていい？**
→ はい。本MCPが全機能を包含しています。

**Q: APIトークンの権限が多すぎない？**
→ 使わないカテゴリは省略可能。対応ツール呼び出し時にのみ必要です。

**Q: ドメインの購入はできる？**
→ 購入APIはEnterprise限定の可能性あり。登録済みドメインの管理は可能です。

**Q: Freeプランでも使える？**
→ 大半のツールは利用可能です。

## ローカル開発

```bash
git clone https://github.com/DaisukeHori/cloudflare-mcp.git
cd cloudflare-mcp && npm install

export MCP_API_KEY=cfmcp-test-key
export CF_API_TOKEN=your_token
export CF_ACCOUNT_ID=your_account_id

npm run dev   # HTTPモード起動
npm test      # テスト実行（29テスト）
```

## 技術スタック

TypeScript / Express / MCP SDK / Zod / Vercel Serverless Functions / Cloudflare API v4

## ライセンス

MIT License
