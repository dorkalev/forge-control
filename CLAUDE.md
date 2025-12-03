# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Forge is a local developer workbench that integrates Linear issues with Git worktrees and GitHub PRs. It runs as:
- **Local HTTP server** (`src/index.js` on port 4665) - API endpoints and dashboard
- **Electron shell** (`electron/main.cjs`) - Desktop app wrapper that starts the server
- **CLI tool** (`bin/forge.cjs`) - Launches Electron from any directory with a `.forge` config

## Commands

```bash
# Start server only (development)
npm run dev                    # Runs migrate.js then index.js

# Start Electron app
npm run app                    # Launches desktop shell

# Build Electron app
npm run build                  # Build for macOS (dir output)
npm run build:prod            # Build for macOS (distributable)

# Use CLI from any project directory
forge                         # Requires .forge file in current directory
```

## Architecture

### Entry Points
- `index.js` - Legacy monolithic server with Linear webhook handling, OAuth, and task categorization
- `src/index.js` - Modular server entry point (preferred)
- `src/routes/index.js` - Route dispatcher mapping paths to handlers

### Core Layers

**Handlers** (`src/handlers/`) - HTTP request handlers for each feature:
- `root.js` - Dashboard HTML rendering
- `branch.js` - Branch creation and PR workflows
- `worktree.js` - Git worktree creation/management
- `linear.js` - Linear issue fetching and assignment
- `autopilot.js` - Automatic agent orchestration
- `status.js` - Linear/GitHub status for folders
- `open.js`, `tmux.js` - Local tooling (terminals, editors)

**Services** (`src/services/`) - Business logic and external API clients:
- `linear.js` - Linear GraphQL API (issues, states, assignments)
- `github.js` - GitHub REST/GraphQL API (PRs, checks, reviews)
- `worktree.js` - Git worktree operations
- `projects.js` - Multi-project config management
- `autopilot.js` - Agent lifecycle management

**Configuration** (`src/config/env.js`) - Environment variables with path expansion

### Data Flow
1. Dashboard shows worktrees under `WORKTREE_BASE_PATH` (derived from `LOCAL_REPO_PATH`)
2. Each worktree folder maps to a Linear ticket ID (e.g., `ENG-123-feature-name`)
3. Status enrichment fetches Linear state and GitHub PR status per branch
4. Actions create branches, worktrees, PRs, and update Linear states

### Key Patterns
- ESM modules throughout (`"type": "module"` in package.json)
- `.cjs` extension required for CommonJS files (Electron main, CLI)
- Configuration via `.forge` or `.env` files, loaded by dotenv
- PostgreSQL database (`db.js`) for GitHub token storage
- Paths support `~` expansion via `expandPath()` helper

### External Integrations
- **Linear API**: GraphQL at `api.linear.app/graphql`, auth via `LINEAR_APP` env var
- **GitHub API**: REST + GraphQL, auth via `GITHUB_TOKEN` env var
- **OpenRouter**: AI categorization via `OPENROUTER_API_KEY`
- **Render**: Deployment status via `RENDER_API_KEY`

## Environment Variables

Required for core features:
- `LOCAL_REPO_PATH` - Base path for worktrees
- `WORKTREE_REPO_PATH` - Git repo to create worktrees from
- `LINEAR_APP` - Linear API key
- `GITHUB_TOKEN` - GitHub personal access token
- `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME` - Target repository

Optional:
- `FORGE_PORT` / `LOCAL_AGENT_PORT` - Server port (default: 4665)
- `LINEAR_USERNAME` - Filter issues by assignee
- `DATABASE_URL` - PostgreSQL connection for token storage
