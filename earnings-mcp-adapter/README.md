# Earnings MCP Adapter

This is a Model Context Protocol (MCP) adapter that connects your local MCP Client (like Gemini CLI, Claude Desktop, etc.) to the remote Earnings Analysis Cloudflare Worker.

## Usage

You do not need to install this package globally. You can use `npx` to run it directly from your MCP configuration.

### Gemini CLI Configuration

Add the following to your `~/.gemini/settings.json` (or `%USERPROFILE%\.gemini\settings.json` on Windows):

```json
{
  "mcpServers": {
    "earnings": {
      "command": "npx",
      "args": [
        "-y",
        "earnings-mcp-adapter"
      ]
    }
  }
}
```

### Claude Desktop Configuration

Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "earnings": {
      "command": "npx",
      "args": [
        "-y",
        "earnings-mcp-adapter"
      ]
    }
  }
}
```

## Features

- **Zero Config**: Connects automatically to the configured production worker.
- **Secure**: Runs locally as a bridge, keeping your tokens safe (if implemented in future versions).
- **Lightweight**: Uses standard `fetch` API (requires Node.js 18+).

## Debugging

To see debug logs (written to stderr), enable the debug flag:
```bash
DEBUG=1 npx earnings-mcp-adapter
```
