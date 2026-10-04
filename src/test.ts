import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "dotenv";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { applyDeploymentContract, deploymentLifecycle } from "./deployment-guidance.js";

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
  env.AI_BUILDER_TOKEN = "synthetic-test-token";
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

async function withClient<T>(homeDir: string, callback: (client: Client) => Promise<T>, overrides: Record<string, string> = {}): Promise<T> {
  // Preload fetch fixtures in the child process: no live API or provider calls.
  const preload = join(homeDir, "mock-remote.mjs");
  await writeFile(preload, `
globalThis.fetch = async function(input) {
  const url = String(input);
  if (url.endsWith('/backend/openapi.json')) {
    if (process.env.TEST_REMOTE_FAILURE === 'true') return new Response('unavailable', {status: 503});
    return new Response(JSON.stringify({openapi: '3.1.0', servers: [{url: '/backend'}], paths: {
      '/v1/deployments': {post: {responses: {'202': {description: 'Accepted'}}}}
    }}), {status: 200});
  }
  if (url.endsWith('/deployment-prompt.md')) {
    if (process.env.TEST_REMOTE_FAILURE === 'true') return new Response('unavailable', {status: 503});
    return new Response('# Remote preparation guide\\n\\nKeep the Dockerfile requirement.\\n\\n### Step 4: Deployment Assistance\\nWait 60 seconds for streaming_logs. If streaming_logs is empty, double-check the GitHub repo URL and branch.\\n\\n### Conversation Best Practices\\nKeep support instructions.', {status: 200});
  }
  throw new Error('Unexpected network access in offline MCP test');
};
`);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", preload, "--import", "tsx", "src/index.ts"],
    env: { ...getTestEnv(homeDir), ...overrides },
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

function testDeploymentContractRendering(): void {
  console.log("Testing final-state deployment workflow and remote-section replacement");
  const legacy = "# Docker setup\nKeep Dockerfile\nValues submitted to `POST /v1/deployments` may appear in deployment logs or audit records.\nValues may be retained in AI Builder deployment audit data.\n\n### Step 4: Deployment Assistance\nIf streaming_logs is empty, double-check the repository.\n\n### Conversation Best Practices\nKeep support\n";
  const rendered = applyDeploymentContract(legacy);
  assert.ok(rendered.includes("Keep Dockerfile"));
  assert.ok(rendered.includes("Keep support"));
  assert.ok(!rendered.includes("double-check the repository"));
  assert.ok(!rendered.includes("Values may be retained in AI Builder deployment audit data"));
  assert.ok(rendered.includes("new environment dumps are not written"));
  assert.ok(rendered.includes("202 response means only"));
  assert.ok(rendered.includes("streaming_logs field is null by design"));
  assert.ok(rendered.includes("log_type=build&timeout=5"));
  assert.ok(rendered.includes("log_type=runtime&timeout=5"));
  assert.ok(rendered.includes("Do not repeat POST"));
  assert.equal(applyDeploymentContract(rendered), rendered);
  assert.ok(applyDeploymentContract("# Minimal guide").includes("### Step 4: Deployment Assistance"));
  assert.ok(applyDeploymentContract(legacy.replaceAll("\n", "\r\n")).includes("Keep support"));
  assert.deepEqual(deploymentLifecycle.pending_states, ["queued", "deploying"]);
}

async function testGuideCacheRefreshAndContract(): Promise<void> {
  console.log("Testing guide caching, force refresh, and final-state MCP guidance");
  const homeDir = await mkdtemp(join(tmpdir(), "mcp-coach-guide-test-"));
  try {
    await withClient(homeDir, async client => {
      const tools = await client.listTools();
      const guideTool = tools.tools.find(tool => tool.name === "get_deployment_guide");
      assert.ok(guideTool?.inputSchema.properties?.force_refresh);
      const first = parseToolJson(await client.callTool({name: "get_deployment_guide", arguments: {force_refresh: true}}));
      const second = parseToolJson(await client.callTool({name: "get_deployment_guide", arguments: {}}));
      const fresh = parseToolJson(await client.callTool({name: "get_deployment_guide", arguments: {force_refresh: true}}));
      assert.equal(first.source, "remote");
      assert.equal(second.source, "cache");
      assert.equal(fresh.source, "remote");
      assert.equal(first.cached_at, second.cached_at);
      assert.equal(requireObject(second.cache, "guide cache").ttl_hours, 24);
      assert.equal(second.deployment_contract_source, "package");
      const guide = String(second.deployment_guide);
      assert.ok(guide.includes("Keep the Dockerfile requirement"));
      assert.ok(guide.includes("Keep support instructions"));
      assert.ok(!guide.includes("Wait 60 seconds for streaming_logs"));
      assert.ok(!guide.includes("double-check the GitHub repo URL"));
      assert.ok(guide.includes("streaming_logs field is null by design"));
      const lifecycle = requireObject(second.deployment_lifecycle, "guide lifecycle");
      assert.equal(lifecycle.acceptance_http_status, 202);
      const spec = parseToolJson(await client.callTool({name: "get_api_specification", arguments: {}}));
      const apiInfo = requireObject(spec.deployment_api_info, "API deployment info");
      assert.deepEqual(apiInfo.lifecycle, lifecycle);
      await writeFile(join(homeDir, ".ai-builders-mcp-cache", "deployment_guide_cache.json"), JSON.stringify({
        content: "expired guide content", cached_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
        package_version: requireObject(second.cache, "guide cache").package_version,
      }));
      const expired = parseToolJson(await client.callTool({name: "get_deployment_guide", arguments: {}}));
      assert.equal(expired.source, "remote");
      assert.ok(!String(expired.deployment_guide).includes("expired guide content"));
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
}

async function testOldCacheDoesNotSurvivePackageUpgrade(): Promise<void> {
  console.log("Testing package-version cache invalidation");
  const homeDir = await mkdtemp(join(tmpdir(), "mcp-coach-old-cache-test-"));
  try {
    const cacheDir = join(homeDir, ".ai-builders-mcp-cache");
    await mkdir(cacheDir);
    await writeFile(join(cacheDir, "deployment_guide_cache.json"), JSON.stringify({
      content: "old cached content", cached_at: new Date().toISOString(), package_version: "1.0.10", source: "remote",
    }));
    await writeFile(join(cacheDir, "openapi_spec_cache.json"), JSON.stringify({
      spec: {servers: [{url: "https://obsolete.example.test"}]}, cached_at: new Date().toISOString(), package_version: "1.0.10",
    }));
    await withClient(homeDir, async client => {
      const guide = parseToolJson(await client.callTool({name: "get_deployment_guide", arguments: {}}));
      const spec = parseToolJson(await client.callTool({name: "get_api_specification", arguments: {}}));
      assert.equal(guide.source, "remote");
      assert.ok(!String(guide.deployment_guide).includes("old cached content"));
      assert.equal(requireObject(spec.cache, "OpenAPI cache").source, "remote");
      assert.equal(requireObject(spec.endpoint_info, "endpoint").base_url, "https://space.ai-builders.com/backend");
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
}

async function testOfflineDefaultGuideUsesFinalContract(): Promise<void> {
  console.log("Testing remote failure fallback does not restore inline-log advice");
  const homeDir = await mkdtemp(join(tmpdir(), "mcp-coach-guide-fallback-test-"));
  try {
    await withClient(homeDir, async client => {
      const guide = parseToolJson(await client.callTool({name: "get_deployment_guide", arguments: {service_type: "express", force_refresh: true}}));
      assert.equal(guide.source, "default");
      assert.ok(String(guide.deployment_guide).includes("EXPRESS Service Deployment Guide"));
      assert.ok(String(guide.deployment_guide).includes("202 response means only"));
      assert.ok(String(guide.deployment_guide).includes("streaming_logs field is null by design"));
      assert.equal(requireObject(guide.deployment_lifecycle, "fallback lifecycle").acceptance_http_status, 202);
    }, {TEST_REMOTE_FAILURE: "true"});
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
    testDeploymentContractRendering();
    await testGuideCacheRefreshAndContract();
    await testOldCacheDoesNotSurvivePackageUpgrade();
    await testOfflineDefaultGuideUsesFinalContract();
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
