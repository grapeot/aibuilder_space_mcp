# AI Builder MCP

An MCP server that provides deployment guidance and API usage support for the AI Builders platform. This README is for end users and focuses on installation and usage, not development.

## Install

```bash
npm install -g @aibuilders/mcp-coach-server
```

You can also run without a global install:

```bash
npx @aibuilders/mcp-coach-server
```

## Run

The server reads `AI_BUILDER_TOKEN` from your environment.

```bash
AI_BUILDER_TOKEN=your_token_here mcp-coach-server
```

Or with `npx`:

```bash
AI_BUILDER_TOKEN=your_token_here npx mcp-coach-server
```

## Configure in MCP Clients

Example (Claude Desktop `mcpServers`):

```json
{
  "mcpServers": {
    "ai-builder-mcp": {
      "command": "mcp-coach-server",
      "env": {
        "AI_BUILDER_TOKEN": "your_token_here"
      }
    }
  }
}
```

## Deployment Guidance

The Coach provides instructions and API metadata; your AI assistant makes the deployment requests.

- `POST /v1/deployments` returns **202 Accepted** after the task is queued, not after deployment succeeds.
- `streaming_logs` is null in deployment POST and status responses. Empty inline logs do not indicate a bad repository or branch.
- Poll `GET /v1/deployments/{service_name}` while status is `queued` or `deploying`. Do not submit another POST just because the task is still pending or a response timed out.
- Fetch build logs through `/v1/deployments/{service_name}/logs?log_type=build&timeout=5`, or runtime logs with `log_type=runtime`. Logs come from Koyeb on demand; each call returns JSON after a bounded collection window.
- After `HEALTHY`, verify the public URL before reporting success. Use live logs to diagnose `ERROR`, `UNHEALTHY`, or `DEGRADED`.

Deployment guidance and OpenAPI metadata are cached for 24 hours. To fetch fresh data, call `get_deployment_guide` or `get_api_specification` with `{"force_refresh": true}`. When upgrading the package, restart the MCP server so the new version is loaded.

## License

MIT
