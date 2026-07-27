/**
 * Swiggy Builders Club MCP wire format.
 * Official curl examples use JSON-RPC 2.0 tools/call:
 * https://mcp.swiggy.com/builders/docs/reference/food/search_restaurants.md
 */

export type JsonRpcId = string | number;

export interface SwiggyJsonRpcRequest {
  jsonrpc: '2.0';
  method: 'tools/call';
  params: {
    name: string;
    arguments: Record<string, unknown>;
  };
  id: JsonRpcId;
}

export interface SwiggySuccessEnvelope<T = unknown> {
  success: true;
  data: T;
  message?: string;
}

export interface SwiggyErrorEnvelope {
  success: false;
  error: {
    message: string;
    code?: string;
    reportLink?: string;
    reportHint?: string;
  };
}

export type SwiggyEnvelope<T = unknown> = SwiggySuccessEnvelope<T> | SwiggyErrorEnvelope;

export interface JsonRpcResultBody<T = unknown> {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result?: SwiggyEnvelope<T> | T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

let rpcId = 1;

export function nextRpcId(): number {
  rpcId += 1;
  return rpcId;
}

export function buildToolsCallRequest(
  tool: string,
  args: Record<string, unknown>,
  id: JsonRpcId = nextRpcId()
): SwiggyJsonRpcRequest {
  return {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: tool,
      arguments: args,
    },
    id,
  };
}

/**
 * Normalize either:
 * - JSON-RPC `{ result: { success, data } }` / `{ error }`
 * - Direct Builders Club envelope `{ success, data }`
 * - Legacy mock `{ success, data }`
 */
export function parseToolsCallResponse<T>(
  body: unknown,
  httpStatus: number
): SwiggyEnvelope<T> {
  if (!body || typeof body !== 'object') {
    return {
      success: false,
      error: { message: `Empty MCP response (${httpStatus})` },
    };
  }

  const raw = body as JsonRpcResultBody<T> & SwiggyEnvelope<T>;

  // JSON-RPC transport error (auth etc.)
  if ('error' in raw && raw.error && typeof raw.error === 'object' && 'code' in raw.error) {
    const rpcErr = raw.error as { code: number; message: string };
    return {
      success: false,
      error: {
        message: rpcErr.message || `JSON-RPC error ${rpcErr.code}`,
        code: rpcErr.code === -32001 ? 'UNAUTHENTICATED' : undefined,
      },
    };
  }

  // JSON-RPC result wrapping envelope
  if ('result' in raw && raw.result !== undefined) {
    const result = raw.result;
    if (result && typeof result === 'object' && 'success' in (result as object)) {
      return result as SwiggyEnvelope<T>;
    }
    return { success: true, data: result as T };
  }

  // Direct envelope
  if ('success' in raw) {
    return raw as SwiggyEnvelope<T>;
  }

  return {
    success: false,
    error: { message: `Unrecognized MCP response shape (${httpStatus})` },
  };
}
