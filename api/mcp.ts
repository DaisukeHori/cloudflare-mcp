import type { VercelRequest, VercelResponse } from "@vercel/node";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "../src/server.js";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  // Health check
  if (req.method === "GET") {
    res.status(200).json({
      name: "cloudflare-mcp",
      version: "1.0.0",
      status: "ok",
      tools: 65,
      categories: 15,
      docs: "https://github.com/DaisukeHori/cloudflare-mcp",
    });
    return;
  }

  // API key validation
  const key = (req.query.key as string) || "";
  const expectedKey = process.env.MCP_API_KEY || "";
  if (!expectedKey || key !== expectedKey) {
    res.status(401).json({ error: "Unauthorized: invalid or missing API key. Use ?key=<MCP_API_KEY>" });
    return;
  }

  // MCP request handling
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
    console.error("MCP handler error:", err);
    if (!res.headersSent) {
      const message = err instanceof Error ? err.message : "Internal server error";
      res.status(500).json({ error: message });
    }
  }
}
