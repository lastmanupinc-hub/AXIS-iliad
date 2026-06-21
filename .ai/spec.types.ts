/**
 * spec.types.ts
 * Generated protocol contract types for axis-iliad.
 *
 * Scope:
 * - JSON-RPC envelopes
 * - Session and handshake messages
 * - Tools, resources, prompts contracts
 * - Pagination, cancellation, progress
 */

export type JsonRpcVersion = "2.0";
export type JsonRpcId = string | number | null;

export interface JsonRpcRequest<TParams = Record<string, unknown>> {
  jsonrpc: JsonRpcVersion;
  id: JsonRpcId;
  method: string;
  params?: TParams;
}

export interface JsonRpcNotification<TParams = Record<string, unknown>> {
  jsonrpc: JsonRpcVersion;
  method: string;
  params?: TParams;
}

export interface JsonRpcSuccess<TResult = unknown> {
  jsonrpc: JsonRpcVersion;
  id: JsonRpcId;
  result: TResult;
}

export interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcErrorResponse {
  jsonrpc: JsonRpcVersion;
  id: JsonRpcId;
  error: JsonRpcErrorObject;
}

export type JsonRpcResponse<TResult = unknown> = JsonRpcSuccess<TResult> | JsonRpcErrorResponse;
export type JsonRpcBatchRequest = Array<JsonRpcRequest | JsonRpcNotification>;
export type JsonRpcBatchResponse<TResult = unknown> = Array<JsonRpcResponse<TResult>>;

export type TransportKind = "stdio" | "streamable-http" | "websocket";

export interface ClientInfo {
  name: string;
  version: string;
}

export interface ServerInfo {
  name: string;
  version: string;
}

export interface CapabilityAdvertisement {
  tools?: boolean | Record<string, unknown>;
  resources?: boolean | Record<string, unknown>;
  prompts?: boolean | Record<string, unknown>;
  experimental?: Record<string, unknown>;
  supportedSeps?: string[];
}

export interface InitializeParams {
  protocolVersion: string;
  capabilities: CapabilityAdvertisement;
  clientInfo?: ClientInfo;
}

export interface InitializeResult {
  protocolVersion: string;
  capabilities: CapabilityAdvertisement;
  serverInfo: ServerInfo;
}

export type InitializeRequest = JsonRpcRequest<InitializeParams> & { method: "initialize" };
export type InitializedNotification = JsonRpcNotification<Record<string, never>> & {
  method: "notifications/initialized";
};

export interface SessionContext {
  sessionId?: string;
  accountId?: string;
  transport: TransportKind;
  protocolVersion: string;
}

export interface ToolSchema {
  type: string;
  required?: string[];
  properties?: Record<string, unknown>;
  additionalProperties?: boolean;
}

export interface StandardSchemaV1 extends ToolSchema {
  $schema: string;
  $id?: string;
  version?: string;
}

export type ZodCompatibleSchema = StandardSchemaV1;

export interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema: StandardSchemaV1 | ZodCompatibleSchema;
  outputSchema?: StandardSchemaV1 | ZodCompatibleSchema;
}

export interface ToolCallParams<TArgs = Record<string, unknown>> {
  name: string;
  arguments?: TArgs;
}

export interface ToolContentBlock {
  type: "text" | "json" | "image" | string;
  text?: string;
  data?: unknown;
  mimeType?: string;
}

export interface ToolCallResult {
  content: ToolContentBlock[];
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
}

export type ToolsListRequest = JsonRpcRequest<Record<string, never>> & { method: "tools/list" };
export interface ToolsListResult {
  tools: ToolDefinition[];
}

export type ToolCallRequest<TArgs = Record<string, unknown>> = JsonRpcRequest<ToolCallParams<TArgs>> & {
  method: "tools/call";
};

export interface ResourceTemplate {
  uriTemplate: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface ResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface ResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

export interface ResourcesListResult {
  resources: ResourceDefinition[];
  templates?: ResourceTemplate[];
}

export interface ResourceReadParams {
  uri: string;
}

export interface ResourceReadResult {
  contents: ResourceContent[];
}

export type ResourcesListRequest = JsonRpcRequest<Record<string, never>> & { method: "resources/list" };
export type ResourceReadRequest = JsonRpcRequest<ResourceReadParams> & { method: "resources/read" };

export interface PromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface PromptDefinition {
  name: string;
  description?: string;
  arguments?: PromptArgument[];
}

export interface PromptMessage {
  role: "system" | "user" | "assistant";
  content: ToolContentBlock;
}

export interface PromptGetParams {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface PromptGetResult {
  messages: PromptMessage[];
}

export type PromptsListRequest = JsonRpcRequest<Record<string, never>> & { method: "prompts/list" };
export type PromptGetRequest = JsonRpcRequest<PromptGetParams> & { method: "prompts/get" };

export interface PaginationEnvelope<T> {
  items: T[];
  nextCursor?: string;
  totalCount?: number;
}

export interface CancelParams {
  requestId: JsonRpcId;
}

export type CancelNotification = JsonRpcNotification<CancelParams> & {
  method: "notifications/cancel";
};

export interface ProgressParams {
  requestId: JsonRpcId;
  progress: number;
  message?: string;
}

export type ProgressNotification = JsonRpcNotification<ProgressParams> & {
  method: "notifications/progress";
};