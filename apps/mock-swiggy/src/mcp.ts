/** Parse MCP JSON-RPC tools/call or legacy { tool, params }. */
export async function parseToolCall(
  c: { req: { path: string; json: () => Promise<unknown> } },
  server: string
) {
  const envelope = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;

  // Official Builders Club wire format
  if (envelope.jsonrpc === '2.0' && envelope.method === 'tools/call') {
    const params = (envelope.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
    const id = envelope.id;
    const rpcId =
      typeof id === 'string' || typeof id === 'number' ? id : 1;
    return {
      tool: params.name ?? '',
      params: (params.arguments ?? {}) as Record<string, unknown>,
      rpcId,
    };
  }

  const pathTool = c.req.path.replace(`/${server}`, '').replace(/^\/im/, '').replace(/^\//, '');
  const tool =
    pathTool ||
    (typeof envelope.tool === 'string' ? envelope.tool : '') ||
    (typeof envelope.name === 'string' ? envelope.name : '');
  const params = ((envelope.params ?? envelope.arguments ?? envelope) as Record<string, unknown>) ?? {};
  // Strip envelope keys if we fell through
  const cleaned = { ...params };
  delete cleaned.tool;
  delete cleaned.jsonrpc;
  delete cleaned.method;
  delete cleaned.id;
  return { tool, params: cleaned, rpcId: null as string | number | null };
}

export function toolSuccess(data: unknown, message?: string, rpcId?: string | number | null) {
  const envelope = { success: true as const, data, ...(message ? { message } : {}) };
  if (rpcId != null) {
    return { jsonrpc: '2.0' as const, id: rpcId, result: envelope };
  }
  return envelope;
}

export function toolFailure(
  message: string,
  code?: string,
  status = 400,
  rpcId?: string | number | null
) {
  const envelope = {
    success: false as const,
    error: { message, ...(code ? { code } : {}) },
  };
  if (rpcId != null) {
    return {
      body: { jsonrpc: '2.0' as const, id: rpcId, result: envelope },
      status,
    };
  }
  return { body: envelope, status };
}
