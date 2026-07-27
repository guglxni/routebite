# AGENTS.md

## graphify

This project has a knowledge graph at `graphify-out/`.

- For codebase questions, prefer `graphify query` / `path` / `explain` when `graphify-out/graph.json` exists.
- After modifying code, run `graphify update .` (AST-only).

## External docs — Swiggy Builders Club

This project integrates Swiggy MCP (Food + Instamart). Before writing Swiggy code, fetch the authoritative docs:

- Index: https://mcp.swiggy.com/builders/llms.txt
- Full text: https://mcp.swiggy.com/builders/llms-full.txt
- Per-page: append `.md` to any `https://mcp.swiggy.com/builders/docs/...` URL

Use `/docs/reference/{food,instamart,dineout}` for tool schemas and `/docs/reference/errors` for errors. Auth: `/docs/start/authenticate`.

Do not invent tool names or parameters. Prefer `.md` page fetches over `llms-full.txt` when you know the area.

Canonical journeys:

- Food: https://mcp.swiggy.com/builders/docs/build/recipes/order-food.md
- Instamart: https://mcp.swiggy.com/builders/docs/build/recipes/order-groceries.md

Smoke test: Food exposes **14** tools; Instamart exposes **13**.
