# AI Builder MCP (Developer Guide)

This document is for internal development and maintenance. It includes local setup, testing with MCP Inspector, and build instructions.

## Quick Start (Development)

```bash
# Clone
git clone <repository-url>
cd student_portal_mcp

# Install dependencies
npm install

# Environment variables
cp .env.example .env
# Edit .env and set AI_BUILDER_TOKEN

# Run in dev mode
npm run dev
```

## MCP Inspector Testing

```bash
# Install Inspector
npm install -g @modelcontextprotocol/inspector

# Run Inspector (in another terminal)
mcp-inspector

# In Inspector UI, connect using either:
# Option 1 (recommended): npx tsx src/index.ts
# Option 2: node dist/index.js
```

## Tool Usage Examples

```json
{
  "tool": "get_api_specification",
  "arguments": {}
}
```

```json
{
  "tool": "get_auth_token",
  "arguments": { "masked": true }
}
```

```json
{
  "tool": "get_deployment_guide",
  "arguments": { "service_type": "fastapi", "force_refresh": true }
}
```

## Build

```bash
npm run build
```

## Offline Tests

```bash
npm run build
npm test
npm pack --dry-run --json
```

The test runner starts the real stdio MCP server with a fetch-fixture preload, a temporary HOME, and a synthetic token. It makes no live deployment or provider requests. Coverage includes fresh/cache/force-refresh paths, package-version cache invalidation, remote-guide failure fallback, and the final deployment contract in both guide and OpenAPI tool results.

`src/deployment-guidance.ts` owns the final deployment lifecycle and current environment-storage notes. Remote material supplies repository preparation instructions; its Step 4 deployment section is replaced with the Coach-owned contract. This prevents a cached remote prompt from reviving obsolete inline-log advice. Tool results identify the contract source as the package. There is no backend-version-dependent workflow.

## Release Order

Version **1.0.11** is prepared for the asynchronous deployment API. Publish it only after the backend release is merged **and deployed**, with:

1. POST returning 202 after acceptance, with `streaming_logs=null`.
2. Status polling working independently of an audit-log cache.
3. The live build/runtime `/logs` endpoint available with the normal platform token.

Then publish the package and tell existing clients to upgrade/restart their MCP process. A repository merge or version bump alone does not publish npm. Do not test this release by creating a production deployment.

## Publish Checklist

- Ensure `AI_BUILDER_TOKEN` handling is correct
- Update version in `package.json`
- Verify the packed files include `dist/deployment-guidance.js` and its declaration
- Verify the backend release prerequisites above before publishing
- `npm publish` (scope: `@aibuilders`)
