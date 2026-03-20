# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RedmineMCP Server - An MCP (Model Context Protocol) server that enables AI agents to interact with Redmine project management via the Redmine API.

## Commands

```bash
npm run dev      # Run in development mode (tsx)
npm run build    # Compile TypeScript to dist/
npm run start    # Run production build
```

## Environment Variables

Required in `.env`:
- `REDMINE_BASE_URL` - Redmine instance URL
- `REDMINE_API_KEY` - Redmine API key

## Architecture

- **MCP Server**: Uses `@modelcontextprotocol/sdk` with stdio transport
- **Schema Validation**: Zod for tool input validation
- **Entry Point**: `src/server.ts` - registers tools and starts the server

### Adding New Tools

Register tools using `server.registerTool()` with:
1. Tool name
2. Config object with `description` and `inputSchema` (Zod schema)
3. Async handler function returning `{ content: [...] }`

## Language

Japanese is used for error messages, comments, and documentation.