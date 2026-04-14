import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { cfRequest, accountPath, requireConfirm, formatJson } from "../services/cloudflare-client.js";
import type { CfPagesProject, CfPagesDeployment } from "../types.js";

export function registerPagesTools(server: McpServer): void {
  server.registerTool(
    "cf_list_pages_projects",
    {
      title: "List Pages Projects",
      description: `Cloudflare Pagesプロジェクト一覧を取得します。プロジェクト名、サブドメイン、プロダクションブランチ、最新デプロイ情報が含まれます。`,
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const data = await cfRequest<CfPagesProject[]>("GET", accountPath("/pages/projects"));
      const projects = data.result.map((p) => ({
        name: p.name,
        subdomain: p.subdomain,
        production_branch: p.production_branch,
        latest_deployment: p.latest_deployment ? {
          url: p.latest_deployment.url,
          environment: p.latest_deployment.environment,
          status: p.latest_deployment.latest_stage?.status,
          created_on: p.latest_deployment.created_on,
        } : null,
      }));
      return { content: [{ type: "text", text: formatJson(projects) }] };
    }
  );

  server.registerTool(
    "cf_get_pages_project",
    {
      title: "Get Pages Project",
      description: `Pagesプロジェクトの詳細を取得します。`,
      inputSchema: {
        project_name: z.string().min(1).describe("プロジェクト名"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ project_name }) => {
      const data = await cfRequest<CfPagesProject>("GET", accountPath(`/pages/projects/${project_name}`));
      return { content: [{ type: "text", text: formatJson(data.result) }] };
    }
  );

  server.registerTool(
    "cf_create_pages_project",
    {
      title: "Create Pages Project",
      description: `新しいPagesプロジェクトを作成します。

Args:
  - name: プロジェクト名（URLの一部になる）
  - production_branch: プロダクションブランチ名（デフォルト: main）`,
      inputSchema: {
        name: z.string().min(1).describe("プロジェクト名"),
        production_branch: z.string().default("main").describe("プロダクションブランチ"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ name, production_branch }) => {
      const data = await cfRequest<CfPagesProject>("POST", accountPath("/pages/projects"), {
        body: { name, production_branch },
      });
      return {
        content: [{
          type: "text",
          text: `✅ Pagesプロジェクトを作成しました。\n\nName: ${data.result.name}\nSubdomain: ${data.result.subdomain}\nProduction branch: ${data.result.production_branch}`,
        }],
      };
    }
  );

  server.registerTool(
    "cf_delete_pages_project",
    {
      title: "Delete Pages Project",
      description: `Pagesプロジェクトと全デプロイメントを削除します。

⚠️ 破壊的操作: confirm: true が必須です。`,
      inputSchema: {
        project_name: z.string().min(1).describe("プロジェクト名"),
        confirm: z.boolean().describe("trueを指定して削除を確認"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ project_name, confirm }) => {
      requireConfirm(confirm, `Pagesプロジェクト '${project_name}' と全デプロイメントを削除します。`);
      await cfRequest<unknown>("DELETE", accountPath(`/pages/projects/${project_name}`));
      return { content: [{ type: "text", text: `✅ Pagesプロジェクト '${project_name}' を削除しました。` }] };
    }
  );

  server.registerTool(
    "cf_list_pages_deployments",
    {
      title: "List Pages Deployments",
      description: `Pagesプロジェクトのデプロイメント一覧を取得します。URL、環境、ステータス、トリガー情報が含まれます。`,
      inputSchema: {
        project_name: z.string().min(1).describe("プロジェクト名"),
        page: z.number().int().min(1).default(1).describe("ページ番号"),
        per_page: z.number().int().min(5).max(25).default(10).describe("1ページあたりの件数"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ project_name, page, per_page }) => {
      const data = await cfRequest<CfPagesDeployment[]>("GET", accountPath(`/pages/projects/${project_name}/deployments`), {
        params: { page, per_page },
      });
      const deployments = data.result.map((d) => ({
        id: d.id,
        url: d.url,
        environment: d.environment,
        status: d.latest_stage?.status,
        stage: d.latest_stage?.name,
        created_on: d.created_on,
        trigger: d.deployment_trigger?.type,
        branch: d.deployment_trigger?.metadata?.branch,
      }));
      return { content: [{ type: "text", text: formatJson(deployments) }] };
    }
  );

  server.registerTool(
    "cf_create_pages_deployment",
    {
      title: "Create Pages Deployment",
      description: `Pagesプロジェクトの新しいデプロイをトリガーします。プロダクションブランチからのデプロイを開始します。

注意: リポジトリとアカウントがCloudflare Pagesダッシュボードで事前に連携されている必要があります。`,
      inputSchema: {
        project_name: z.string().min(1).describe("プロジェクト名"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ project_name }) => {
      const data = await cfRequest<CfPagesDeployment>("POST", accountPath(`/pages/projects/${project_name}/deployments`));
      return {
        content: [{
          type: "text",
          text: `✅ デプロイを開始しました。\n\nID: ${data.result.id}\nURL: ${data.result.url}\nEnvironment: ${data.result.environment}`,
        }],
      };
    }
  );

  server.registerTool(
    "cf_rollback_pages_deployment",
    {
      title: "Rollback Pages Deployment",
      description: `プロダクションデプロイメントを以前のデプロイにロールバックします。成功したビルドのみロールバック可能です。`,
      inputSchema: {
        project_name: z.string().min(1).describe("プロジェクト名"),
        deployment_id: z.string().min(1).describe("ロールバック先のデプロイメントID"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ project_name, deployment_id }) => {
      const data = await cfRequest<CfPagesDeployment>("POST", accountPath(`/pages/projects/${project_name}/deployments/${deployment_id}/rollback`));
      return {
        content: [{
          type: "text",
          text: `✅ ロールバックを開始しました。\n\nID: ${data.result.id}\nURL: ${data.result.url}`,
        }],
      };
    }
  );
}
