# sestrella.github.io

Personal site built with [Astro](https://astro.build).

## Prerequisites

- Node.js >= 22.12.0
- pnpm

## Environment Variables

- `GITHUB_TOKEN` (required): A GitHub Personal Access Token used to query the GitHub GraphQL API for merged pull requests during the build. Set it before running `pnpm run build`; the build fails if it is missing. See `src/lib/contributions.ts`.
- `GITHUB_USERNAME` (optional): The GitHub username whose merged PRs are fetched. Defaults to `sestrella` when not set.

## Commands

All commands are run from the root of the project, from a terminal:

| Command          | Action                                       |
| :--------------- | :------------------------------------------- |
| `pnpm install`   | Installs dependencies                        |
| `pnpm dev`       | Starts local dev server at `localhost:4321`  |
| `pnpm run build` | Build the production site to `./dist/`       |
| `pnpm preview`   | Preview the build locally, before deploying  |
| `pnpm astro ...` | Run CLI commands like `astro add`, `astro check` |
