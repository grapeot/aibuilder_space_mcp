import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "dotenv";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

config();

type JsonObject = Record<string, unknown>;

function getTestEnv(homeDir: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  env.HOME = homeDir;
  return env;
}

function requireObject(value: unknown, label: string): JsonObject {
  assert.equal(typeof value, "object", `${label} should be an object`);
  assert.notEqual(value, null, `${label} should not be null`);
  return value as JsonObject;
}

function parseToolJson(result: unknown): JsonObject {
  const resultObject = requireObject(result, "tool result");
  assert.ok(Array.isArray(resultObject.content), "tool result should include content array");
  const firstContent = requireObject(resultObject.content[0], "first tool content");
  assert.ok(firstContent, "tool result should include content");
  assert.equal(firstContent.type, "text", "tool result should be text");
  const text = firstContent.text;
  assert.equal(typeof text, "string", "tool text content should be a string");
  if (typeof text !== "string") {
    throw new Error("tool text content should be a string");
  }
  return requireObject(JSON.parse(text), "tool JSON");
}

async function withClient<T>(homeDir: string, callback: (client: Client) => Promise<T>): Promise<T> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", "src/index.ts"],
    env: getTestEnv(homeDir),
    stderr: "ignore"
  });
  const client = new Client(
    { name: "mcp-coach-server-test", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);
  try {
    return await callback(client);
  } finally {
    await client.close();
  }
}

async function testOpenApiCache(): Promise<void> {
  console.log("Testing get_api_specification cache behavior");
  const homeDir = await mkdtemp(join(tmpdir(), "mcp-coach-cache-test-"));
  try {
    await withClient(homeDir, async (client) => {
      const first = parseToolJson(await client.callTool({
        name: "get_api_specification",
        arguments: { force_refresh: true }
      }));
      const second = parseToolJson(await client.callTool({
        name: "get_api_specification",
        arguments: {}
      }));

      const firstCache = requireObject(first.cache, "first cache metadata");
      const secondCache = requireObject(second.cache, "second cache metadata");
      const endpointInfo = requireObject(second.endpoint_info, "endpoint info");
      const openapiSpec = requireObject(second.openapi_spec, "OpenAPI spec");

      assert.equal(firstCache.source, "remote");
      assert.equal(secondCache.source, "cache");
      assert.equal(firstCache.cached_at, secondCache.cached_at);
      assert.equal(firstCache.ttl_hours, 24);
      assert.equal(firstCache.openapi_spec_url, "https://space.ai-builders.com/backend/openapi.json");
      assert.equal(endpointInfo.base_url, "https://space.ai-builders.com/backend");
      assert.ok(openapiSpec.paths, "OpenAPI spec should include paths");
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
}

async function testBaseUrlUsesOpenApiCache(): Promise<void> {
  console.log("Testing get_base_url uses cached OpenAPI spec");
  const homeDir = await mkdtemp(join(tmpdir(), "mcp-coach-base-url-test-"));
  try {
    await withClient(homeDir, async (client) => {
      await client.callTool({
        name: "get_api_specification",
        arguments: { force_refresh: true }
      });
      const baseUrlResult = parseToolJson(await client.callTool({
        name: "get_base_url",
        arguments: {}
      }));

      const cache = requireObject(baseUrlResult.cache, "base URL cache metadata");
      assert.equal(baseUrlResult.base_url, "https://space.ai-builders.com/backend");
      assert.equal(baseUrlResult.sdk_base_url, "https://space.ai-builders.com/backend/v1");
      assert.equal(baseUrlResult.source, "openapi_spec");
      assert.equal(cache.source, "cache");
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
}

async function testAuthTokenTool(): Promise<void> {
  console.log("Testing get_auth_token response shape");
  const homeDir = await mkdtemp(join(tmpdir(), "mcp-coach-auth-test-"));
  try {
    await withClient(homeDir, async (client) => {
      const result = parseToolJson(await client.callTool({
        name: "get_auth_token",
        arguments: { masked: true }
      }));
      assert.equal(typeof result.available, "boolean");
      assert.equal(result.masked, true);
      assert.equal(typeof result.note, "string");
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
}

export async function runAllTests(): Promise<boolean> {
  console.log("Running MCP server tests\n");

  try {
    await testOpenApiCache();
    await testBaseUrlUsesOpenApiCache();
    await testAuthTokenTool();
    console.log("\nAll tests passed");
    return true;
  } catch (error) {
    console.error("\nTest failed:", error);
    return false;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const passed = await runAllTests();
  process.exit(passed ? 0 : 1);
}
