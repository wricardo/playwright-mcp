# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **Playwright MCP Server** - a Model Context Protocol server that provides browser automation capabilities using Playwright. The server enables LLMs to interact with web pages through structured accessibility snapshots without requiring screenshots or vision models.

## Development Commands

### Building and Development
- `npm run build` - Compile TypeScript to JavaScript in `lib/` directory
- `npm run watch` - Watch mode for development with automatic recompilation
- `npm run clean` - Remove compiled output in `lib/` directory

### Token Usage Optimization
- `--output-to-files` - Write detailed output to files instead of including in responses
- Environment variable: `PLAYWRIGHT_MCP_OUTPUT_TO_FILES=true`

When enabled, console messages, network requests, and detailed page snapshots are written to files in the output directory. Responses contain file paths with LLM-friendly commands like `head -20`, `grep <pattern>`, `tail -10` to examine portions efficiently, with `cat` as a fallback for full content.

### Code Quality
- `npm run lint` - Run all linting (includes readme updates, dependency checks, ESLint, and TypeScript checks)
- `npm run lint-fix` - Auto-fix ESLint issues
- `npm run check-deps` - Verify dependency consistency

### Testing
- `npm test` - Run all Playwright tests across browsers
- `npm run ctest` - Run Chrome-specific tests 
- `npm run ftest` - Run Firefox-specific tests
- `npm run wtest` - Run WebKit-specific tests

### Utilities
- `npm run update-readme` - Auto-generate tool documentation in README.md
- `npm run run-server` - Start standalone MCP server

## Architecture

### Core Components

**MCP Server Infrastructure** (`src/mcp/`)
- `server.ts` - Main MCP server implementation and transport management
- `tool.ts` - Tool definition and MCP schema conversion
- `http.ts` - HTTP/SSE transport for standalone server mode
- `inProcessTransport.ts` - In-process communication for library usage

**Browser Context Management** (`src/browserContextFactory.ts`, `src/context.ts`)
- **PersistentContextFactory** - Default mode with saved browser profile
- **IsolatedContextFactory** - Clean session mode (--isolated flag)
- **CdpContextFactory** - Connect to existing browser via CDP
- **RemoteContextFactory** - Connect to remote Playwright server
- **ExtensionContextFactory** - Browser extension integration

**Backend Implementation** (`src/browserServerBackend.ts`)
- Main server backend that coordinates browser contexts and tool execution
- Handles tool filtering based on capabilities
- Manages session logging and configuration

**Tool System** (`src/tools/`)
- Each tool category in separate file (mouse.ts, keyboard.ts, navigate.ts, etc.)
- Tool definitions with Zod schema validation
- Capability-based filtering (vision, pdf, tabs, install, verify)

### Tool Categories

**Core Automation**: click, type, navigate, hover, drag, evaluate JavaScript
**Form Handling**: fill forms, select options, upload files
**Network & Console**: request monitoring, console message capture
**Visual**: screenshots, PDF generation, page snapshots
**Tabs & Windows**: tab management, window resizing
**Verification**: element visibility, text presence, value checking (opt-in)
**Coordinate-based**: XY mouse operations (opt-in via --caps=vision)

### Configuration System (`src/config.ts`)

Supports both CLI arguments and JSON configuration files with:
- Browser selection (chromium, firefox, webkit, chrome, msedge)
- Launch options (headless, user data directory, executable path)  
- Network controls (proxy, origin allowlists/blocklists)
- Capabilities (vision, pdf, tabs, install, verify)
- Context options (viewport, device emulation)

## Development Notes

### TypeScript Setup
- Uses ES modules (`"type": "module"` in package.json)
- Compiled output goes to `lib/` directory
- Import paths use `.js` extensions for compiled output compatibility

### Browser Context Lifecycle
- Contexts are created on-demand and cached
- Different factories handle various connection modes
- Proper cleanup on server shutdown via `Context.disposeAll()`

### Tool Implementation Pattern
Each tool follows this structure:
```typescript
export const toolName: Tool<ToolArgsSchema> = {
  name: 'tool_name',
  description: 'Tool description',
  inputSchema: zodSchema,
  async handler(args, context) {
    // Implementation
  }
}
```

### Testing Infrastructure
- Uses Playwright Test framework with custom fixtures
- Multi-browser testing (Chrome, Chromium, Firefox, WebKit, Edge on Windows)
- Docker testing support for headless scenarios
- Custom test fixtures in `tests/fixtures.ts`

### Extension Integration (`src/extension/`)
- Chrome/Edge extension support for connecting to running browsers
- CDP relay system for communication
- Protocol definitions for extension communication