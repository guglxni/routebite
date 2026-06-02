/** Parse MCP-style POST { tool, params } or legacy path-based tool calls */
export async function parseToolCall(c: { req: { path: string; json: () => Promise<unknown> } }, server: string) {
  const envelope = (await c.req.json().catch(() => ({}))) as {
    tool?: string;
    params?: Record<string, unknown>;
    [key: string]: unknown;
  };
  const pathTool = c.req.path.replace(`/${server}`, "").replace(/^\//, "");
  const tool = pathTool || envelope.tool || "";
  const params = (envelope.params ?? envelope) as Record<string, unknown>;
  return { tool, params };
}
