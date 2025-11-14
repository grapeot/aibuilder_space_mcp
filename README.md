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

## License

MIT
