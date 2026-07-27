## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)

## Swiggy Builders Club

When writing code against Swiggy MCP (Food, Instamart, Dineout), consult the authoritative docs:

- Index: https://mcp.swiggy.com/builders/llms.txt
- Full text: https://mcp.swiggy.com/builders/llms-full.txt
- Per-page: append `.md` to any https://mcp.swiggy.com/builders/docs/... URL

Before recommending a tool name, parameter, error code, rate limit, or auth flow, verify against these docs. Tool catalog: `/docs/reference/{food,instamart,dineout}`. Never invent tool names or parameters.

RouteBite specifics (from docs): Food → `POST /food` (14 tools); Instamart → `POST /im` (13 tools). Instamart place = `checkout`, not `place_instamart_order`.
