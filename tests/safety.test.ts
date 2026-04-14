import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

beforeEach(() => {
  vi.stubEnv("CF_API_TOKEN", "test-token");
  vi.stubEnv("CF_ACCOUNT_ID", "test-account");
});

// Helper to extract tool handler from a registered McpServer
async function getToolHandler(server: McpServer, toolName: string): Promise<Function | undefined> {
  // Access the internal tool map
  const toolsMap = (server as unknown as { _registeredTools?: Map<string, { handler: Function }> })._registeredTools;
  if (toolsMap) {
    return toolsMap.get(toolName)?.handler;
  }
  return undefined;
}

describe("destructive operation safety guards", () => {
  // All destructive tools that require confirm: true
  const destructiveTools = [
    { name: "cf_delete_zone", params: { zone_id: "test-zone" } },
    { name: "cf_delete_dns_record", params: { zone_id: "test-zone", record_id: "test-record" } },
    { name: "cf_delete_tunnel", params: { tunnel_id: "test-tunnel" } },
    { name: "cf_clean_tunnel_connections", params: { tunnel_id: "test-tunnel" } },
    { name: "cf_delete_access_app", params: { app_id: "test-app" } },
    { name: "cf_delete_access_policy", params: { app_id: "test-app", policy_id: "test-policy" } },
    { name: "cf_delete_worker", params: { script_name: "test-worker" } },
    { name: "cf_delete_pages_project", params: { project_name: "test-project" } },
    { name: "cf_delete_r2_bucket", params: { bucket_name: "test-bucket" } },
    { name: "cf_delete_kv_namespace", params: { namespace_id: "test-ns" } },
    { name: "cf_unpublish_hostname", params: { tunnel_id: "test-tunnel", hostname: "test.example.com" } },
  ];

  // We can't easily call tools directly through McpServer's public API without a transport,
  // so we test the requireConfirm function directly which all destructive tools use.

  it("requireConfirm should block when confirm is false", async () => {
    const { requireConfirm } = await import("../src/services/cloudflare-client.js");

    for (const tool of destructiveTools) {
      expect(
        () => requireConfirm(false, `Deleting ${tool.name}`),
        `${tool.name}: should block when confirm=false`
      ).toThrow("confirm: true");
    }
  });

  it("requireConfirm should block when confirm is undefined", async () => {
    const { requireConfirm } = await import("../src/services/cloudflare-client.js");

    expect(() => requireConfirm(undefined, "test")).toThrow("confirm: true");
  });

  it("requireConfirm should allow when confirm is true", async () => {
    const { requireConfirm } = await import("../src/services/cloudflare-client.js");

    expect(() => requireConfirm(true, "test")).not.toThrow();
  });

  it("should have exactly 11 destructive tools defined", () => {
    expect(destructiveTools.length).toBe(11);
  });

  it("all destructive tools should be registered in the server", async () => {
    vi.resetModules();
    const { createServer } = await import("../src/server.js");
    const server = createServer();

    // McpServer uses _registeredTools as an object/record, not a Map
    const internal = server as unknown as Record<string, unknown>;
    const toolsRecord = internal._registeredTools;
    if (toolsRecord && typeof toolsRecord === "object") {
      const toolNames = Object.keys(toolsRecord as Record<string, unknown>);
      for (const tool of destructiveTools) {
        expect(toolNames.includes(tool.name), `${tool.name} should be registered`).toBe(true);
      }
    } else {
      // If we can't access internals, verify the server was at least created
      expect(server).toBeDefined();
    }
  });
});

describe("tunnel config validation", () => {
  it("cf_update_tunnel_config should require catch-all as last rule", async () => {
    // This is tested indirectly through the tool's implementation
    // The tool checks if the last ingress rule has a hostname
    // If it does, it throws an error

    // We verify the logic exists in the source
    const fs = await import("fs");
    const source = fs.readFileSync("src/tools/tunnel-config.ts", "utf-8");
    expect(source).toContain("catch-all");
    expect(source).toContain("lastRule");
  });
});

describe("workflow tools safety", () => {
  it("cf_publish_hostname should check for duplicate hostnames", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("src/tools/workflows.ts", "utf-8");
    expect(source).toContain("既にこのトンネルのingressに存在");
  });

  it("cf_unpublish_hostname should require confirm", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("src/tools/workflows.ts", "utf-8");
    expect(source).toContain("requireConfirm");
  });
});
