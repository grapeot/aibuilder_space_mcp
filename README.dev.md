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
  "arguments": { "service_type": "fastapi" }
}
```

## Build

```bash
npm run build
```

## Publish Checklist

- Ensure `AI_BUILDER_TOKEN` handling is correct
- Update version in `package.json`
- `npm publish` (scope: `@aibuilders`)

