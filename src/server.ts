import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";

// Phase 1 tools
import { registerAccountTools } from "./tools/account.js";
import { registerZoneTools } from "./tools/zones.js";
import { registerDnsTools } from "./tools/dns.js";
import { registerTunnelTools } from "./tools/tunnel.js";
import { registerTunnelConfigTools } from "./tools/tunnel-config.js";
import { registerTunnelConnectionTools } from "./tools/tunnel-connections.js";
import { registerWorkflowTools } from "./tools/workflows.js";
// Phase 2 tools
import { registerBillingTools } from "./tools/billing.js";
import { registerRegistrarTools } from "./tools/registrar.js";
import { registerAccessAppTools } from "./tools/access-apps.js";
import { registerAccessPolicyTools } from "./tools/access-policies.js";
import { registerSslTools } from "./tools/ssl.js";
// Phase 3 tools
import { registerWorkersTools } from "./tools/workers.js";
import { registerPagesTools } from "./tools/pages.js";
import { registerR2Tools } from "./tools/r2.js";
import { registerKvTools } from "./tools/kv.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "cloudflare-mcp",
    version: "1.0.0",
  });

  // Phase 1: Account + Zone + DNS + Tunnel + Workflows (26 tools)
  registerAccountTools(server);          // 4 tools
  registerZoneTools(server);             // 5 tools
  registerDnsTools(server);              // 4 tools
  registerTunnelTools(server);           // 6 tools
  registerTunnelConfigTools(server);     // 2 tools
  registerTunnelConnectionTools(server); // 2 tools
  registerWorkflowTools(server);         // 3 tools

  // Phase 2: Billing, Registrar, Access, SSL (19 tools)
  registerBillingTools(server);          // 4 tools
  registerRegistrarTools(server);        // 3 tools
  registerAccessAppTools(server);        // 5 tools
  registerAccessPolicyTools(server);     // 5 tools
  registerSslTools(server);              // 2 tools

  // Phase 3: Workers, Pages, R2, KV (24 tools)
  registerWorkersTools(server);          // 7 tools
  registerPagesTools(server);            // 7 tools
  registerR2Tools(server);               // 5 tools
  registerKvTools(server);               // 5 tools

  return server;
}

// ── Standalone HTTP mode ─────────────────────────────────────────────

async function runHTTP(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: "4mb" }));

  app.post("/api/mcp", async (req, res) => {
    // API key validation
    const key = (req.query.key as string) || "";
    const expectedKey = process.env.MCP_API_KEY || "";
    if (!expectedKey || key !== expectedKey) {
      res.status(401).json({ error: "Unauthorized: invalid or missing API key" });
      return;
    }

    try {
      const server = createServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on("close", () => transport.close());
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("MCP request error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  // Health check
  app.get("/api/mcp", (_req, res) => {
    res.json({
      name: "cloudflare-mcp",
      version: "1.0.0",
      status: "ok",
      tools: 69,
      categories: 16,
    });
  });

  app.get("/", (_req, res) => {
    res.redirect("https://github.com/DaisukeHori/cloudflare-mcp");
  });

  const port = parseInt(process.env.PORT || "3000");
  app.listen(port, () => {
    console.error(`cloudflare-mcp running on http://localhost:${port}/api/mcp`);
  });
}

async function runStdio(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("cloudflare-mcp running on stdio");
}

const transport = process.env.TRANSPORT || "stdio";
if (transport === "http") {
  runHTTP().catch((err) => {
    console.error("Server error:", err);
    process.exit(1);
  });
} else {
  runStdio().catch((err) => {
    console.error("Server error:", err);
    process.exit(1);
  });
}
