import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock environment variables
beforeEach(() => {
  vi.stubEnv("CF_API_TOKEN", "test-token-123");
  vi.stubEnv("CF_ACCOUNT_ID", "test-account-id");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("cloudflare-client", () => {
  describe("getAccountId", () => {
    it("should return CF_ACCOUNT_ID when set", async () => {
      const { getAccountId } = await import("../src/services/cloudflare-client.js");
      expect(getAccountId()).toBe("test-account-id");
    });

    it("should throw when CF_ACCOUNT_ID is not set", async () => {
      vi.stubEnv("CF_ACCOUNT_ID", "");
      const mod = await import("../src/services/cloudflare-client.js");
      // Re-import to get fresh module - but vitest caches, so we test the function directly
      expect(() => mod.getAccountId()).toThrow("CF_ACCOUNT_ID");
    });
  });

  describe("accountPath", () => {
    it("should construct correct path", async () => {
      const { accountPath } = await import("../src/services/cloudflare-client.js");
      expect(accountPath("/cfd_tunnel")).toBe("/accounts/test-account-id/cfd_tunnel");
    });
  });

  describe("zonePath", () => {
    it("should construct correct path", async () => {
      const { zonePath } = await import("../src/services/cloudflare-client.js");
      expect(zonePath("zone-123", "/dns_records")).toBe("/zones/zone-123/dns_records");
    });
  });

  describe("requireConfirm", () => {
    it("should not throw when confirm is true", async () => {
      const { requireConfirm } = await import("../src/services/cloudflare-client.js");
      expect(() => requireConfirm(true, "test")).not.toThrow();
    });

    it("should throw when confirm is false", async () => {
      const { requireConfirm } = await import("../src/services/cloudflare-client.js");
      expect(() => requireConfirm(false, "test")).toThrow("confirm: true");
    });

    it("should throw when confirm is undefined", async () => {
      const { requireConfirm } = await import("../src/services/cloudflare-client.js");
      expect(() => requireConfirm(undefined, "test")).toThrow("confirm: true");
    });

    it("should include the warning message", async () => {
      const { requireConfirm } = await import("../src/services/cloudflare-client.js");
      expect(() => requireConfirm(false, "データが消えます")).toThrow("データが消えます");
    });
  });

  describe("truncateResult", () => {
    it("should return text unchanged if under limit", async () => {
      const { truncateResult } = await import("../src/services/cloudflare-client.js");
      expect(truncateResult("hello", 100)).toBe("hello");
    });

    it("should truncate text over limit", async () => {
      const { truncateResult } = await import("../src/services/cloudflare-client.js");
      const result = truncateResult("a".repeat(200), 100);
      expect(result.length).toBeLessThan(300);
      expect(result).toContain("切り詰め");
    });
  });

  describe("cfRequest", () => {
    it("should throw on missing CF_API_TOKEN", async () => {
      vi.stubEnv("CF_API_TOKEN", "");
      // Need to re-import to pick up env change
      vi.resetModules();
      const { cfRequest } = await import("../src/services/cloudflare-client.js");
      await expect(cfRequest("GET", "/test")).rejects.toThrow("CF_API_TOKEN");
    });

    it("should throw descriptive error on 401", async () => {
      vi.resetModules();
      const mockFetch = vi.fn().mockResolvedValue({
        status: 401,
        ok: false,
        json: async () => ({ success: false, errors: [] }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { cfRequest } = await import("../src/services/cloudflare-client.js");
      await expect(cfRequest("GET", "/test")).rejects.toThrow("認証エラー");
    });

    it("should throw descriptive error on 403", async () => {
      vi.resetModules();
      const mockFetch = vi.fn().mockResolvedValue({
        status: 403,
        ok: false,
        json: async () => ({ success: false, errors: [] }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { cfRequest } = await import("../src/services/cloudflare-client.js");
      await expect(cfRequest("GET", "/test")).rejects.toThrow("権限エラー");
    });

    it("should throw descriptive error on 429", async () => {
      vi.resetModules();
      const mockFetch = vi.fn().mockResolvedValue({
        status: 429,
        ok: false,
        json: async () => ({ success: false, errors: [] }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { cfRequest } = await import("../src/services/cloudflare-client.js");
      await expect(cfRequest("GET", "/test")).rejects.toThrow("レート制限");
    });

    it("should throw formatted error on API error response", async () => {
      vi.resetModules();
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          success: false,
          errors: [{ code: 1001, message: "Invalid zone" }],
          messages: [],
          result: null,
        }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { cfRequest } = await import("../src/services/cloudflare-client.js");
      await expect(cfRequest("GET", "/test")).rejects.toThrow("[1001] Invalid zone");
    });

    it("should return result on success", async () => {
      vi.resetModules();
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          success: true,
          errors: [],
          messages: [],
          result: { id: "abc123", name: "test" },
        }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { cfRequest } = await import("../src/services/cloudflare-client.js");
      const data = await cfRequest<{ id: string; name: string }>("GET", "/test");
      expect(data.result.id).toBe("abc123");
      expect(data.result.name).toBe("test");
    });

    it("should pass query params correctly", async () => {
      vi.resetModules();
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ success: true, errors: [], messages: [], result: {} }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { cfRequest } = await import("../src/services/cloudflare-client.js");
      await cfRequest("GET", "/zones", { params: { name: "example.com", page: 1, status: undefined } });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain("name=example.com");
      expect(calledUrl).toContain("page=1");
      expect(calledUrl).not.toContain("status");
    });

    it("should send JSON body for POST", async () => {
      vi.resetModules();
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ success: true, errors: [], messages: [], result: {} }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { cfRequest } = await import("../src/services/cloudflare-client.js");
      await cfRequest("POST", "/tunnels", { body: { name: "test" } });

      const opts = mockFetch.mock.calls[0][1] as RequestInit;
      expect(opts.method).toBe("POST");
      expect(opts.body).toBe('{"name":"test"}');
    });
  });
});
