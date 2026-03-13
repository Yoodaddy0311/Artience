/**
 * MCP Artience Server — Artience 전용 MCP 도구 서버.
 *
 * stdio 기반으로 Claude Code가 spawn하며 JSON-RPC 2.0 프로토콜을 사용.
 * 도구 6개: artience_notify, artience_agent_status, artience_send_mail, artience_project_info,
 *           artience_messenger_send, artience_messenger_receive
 *
 * 두 가지 모드:
 * 1. In-process: Electron main에서 startMcpServer(bridge) 호출 — bridge 직접 사용
 * 2. Standalone: Claude Code가 `node mcp-artience-server.js` 실행 — file-based IPC로 Electron main과 통신
 *
 * 프로젝트 `.mcp.json`에 자동 등록하여 Claude Code가 인식하도록 한다.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';

// ── JSON-RPC 2.0 Types ─────────────────────────────────────────────────────

interface JsonRpcRequest {
    jsonrpc: '2.0';
    id: number | string;
    method: string;
    params?: Record<string, unknown>;
}

interface JsonRpcResponse {
    jsonrpc: '2.0';
    id: number | string | null;
    result?: unknown;
    error?: { code: number; message: string; data?: unknown };
}

// ── MCP Protocol Types ──────────────────────────────────────────────────────

interface McpToolDefinition {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<
            string,
            { type: string; description: string; enum?: string[] }
        >;
        required?: string[];
    };
}

// ── Tool Definitions ────────────────────────────────────────────────────────

const TOOLS: McpToolDefinition[] = [
    {
        name: 'artience_notify',
        description:
            'Artience 앱에 토스트 알림을 표시합니다. 작업 완료나 중요 이벤트를 사용자에게 알릴 때 사용하세요.',
        inputSchema: {
            type: 'object',
            properties: {
                message: { type: 'string', description: '표시할 알림 메시지' },
                type: {
                    type: 'string',
                    description: '알림 유형',
                    enum: ['info', 'success', 'warning', 'error'],
                },
            },
            required: ['message'],
        },
    },
    {
        name: 'artience_agent_status',
        description:
            '현재 활성 에이전트들의 상태를 조회합니다. agentId를 지정하면 해당 에이전트만, 생략하면 전체 목록을 반환합니다.',
        inputSchema: {
            type: 'object',
            properties: {
                agentId: {
                    type: 'string',
                    description: '조회할 에이전트 ID (생략 시 전체 조회)',
                },
            },
        },
    },
    {
        name: 'artience_send_mail',
        description:
            '에이전트 간 메일(보고서)을 전송합니다. 작업 완료 보고, 오류 알림 등에 사용하세요.',
        inputSchema: {
            type: 'object',
            properties: {
                to: {
                    type: 'string',
                    description: '수신 에이전트 이름 (예: sera, rio, luna)',
                },
                subject: { type: 'string', description: '메일 제목' },
                body: { type: 'string', description: '메일 본문' },
            },
            required: ['to', 'subject', 'body'],
        },
    },
    {
        name: 'artience_project_info',
        description:
            '현재 Artience 프로젝트 정보를 반환합니다. 프로젝트 디렉토리, 에이전트 목록, 활성 세션 등을 포함합니다.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'artience_messenger_send',
        description: '연결된 메신저(Discord/Slack)로 메시지를 전송합니다.',
        inputSchema: {
            type: 'object',
            properties: {
                adapter: {
                    type: 'string',
                    description: '메신저 ID (discord/slack)',
                    enum: ['discord', 'slack'],
                },
                channel: {
                    type: 'string',
                    description: '채널 ID 또는 이름',
                },
                message: {
                    type: 'string',
                    description: '전송할 메시지',
                },
            },
            required: ['adapter', 'channel', 'message'],
        },
    },
    {
        name: 'artience_messenger_receive',
        description: '연결된 메신저에서 최근 수신 메시지를 조회합니다.',
        inputSchema: {
            type: 'object',
            properties: {
                adapter: {
                    type: 'string',
                    description: '메신저 ID (discord/slack)',
                    enum: ['discord', 'slack'],
                },
                limit: {
                    type: 'number',
                    description: '조회할 메시지 수 (기본 10)',
                },
            },
            required: ['adapter'],
        },
    },
];

// ── State Bridge (main process에서 주입) ────────────────────────────────────

export interface McpBridge {
    getAgentStatuses():
        | Promise<
              Array<{
                  id: string;
                  label: string;
                  activity: string;
                  pid?: number;
              }>
          >
        | Array<{
              id: string;
              label: string;
              activity: string;
              pid?: number;
          }>;
    sendMail(
        from: string,
        to: string,
        subject: string,
        body: string,
        type: 'report' | 'error',
    ): void | Promise<void>;
    notify(message: string, type: string): void | Promise<void>;
    getProjectInfo():
        | {
              dir: string;
              agents: string[];
              activeSessions: string[];
          }
        | Promise<{
              dir: string;
              agents: string[];
              activeSessions: string[];
          }>;
    sendMessengerMessage(
        adapter: string,
        channel: string,
        message: string,
    ): Promise<{ success: boolean; error?: string }>;
    getMessengerMessages(
        adapter: string,
        limit?: number,
    ): Promise<{
        messages: { sender: string; content: string; timestamp: number }[];
    }>;
}

// ── File-based IPC Bridge (standalone mode) ─────────────────────────────────

/**
 * Bridge communication directory. Electron main writes state here,
 * standalone MCP server reads from here.
 */
export const MCP_BRIDGE_DIR = path.join(os.tmpdir(), 'artience-mcp-bridge');

interface BridgeRequest {
    id: string;
    method: string;
    args: Record<string, unknown>;
    timestamp: number;
}

interface BridgeResponse {
    id: string;
    result?: unknown;
    error?: string;
}

/**
 * File-based bridge for standalone mode.
 * Writes request files, waits for response files from Electron main.
 */
class FileBridge implements McpBridge {
    private requestCounter = 0;

    private async sendRequest(
        method: string,
        args: Record<string, unknown>,
    ): Promise<unknown> {
        const reqId = `req-${Date.now()}-${++this.requestCounter}`;
        const reqFile = path.join(MCP_BRIDGE_DIR, `${reqId}.req.json`);
        const resFile = path.join(MCP_BRIDGE_DIR, `${reqId}.res.json`);

        // Ensure bridge dir exists
        if (!fs.existsSync(MCP_BRIDGE_DIR)) {
            fs.mkdirSync(MCP_BRIDGE_DIR, { recursive: true });
        }

        const request: BridgeRequest = {
            id: reqId,
            method,
            args,
            timestamp: Date.now(),
        };
        fs.writeFileSync(reqFile, JSON.stringify(request), 'utf-8');

        // Poll for response (synchronous — MCP tool calls are blocking)
        const timeout = 5000;
        const start = Date.now();
        while (Date.now() - start < timeout) {
            if (fs.existsSync(resFile)) {
                try {
                    const raw = fs.readFileSync(resFile, 'utf-8');
                    const response: BridgeResponse = JSON.parse(raw);
                    // Clean up
                    try {
                        fs.unlinkSync(reqFile);
                    } catch {
                        /* ignore */
                    }
                    try {
                        fs.unlinkSync(resFile);
                    } catch {
                        /* ignore */
                    }
                    if (response.error) throw new Error(response.error);
                    return response.result;
                } catch (err: any) {
                    if (err.message && !err.message.includes('ENOENT'))
                        throw err;
                }
            }
            // Async sleep ~20ms
            await new Promise((resolve) => setTimeout(resolve, 20));
        }

        // Timeout — clean up request file
        try {
            fs.unlinkSync(reqFile);
        } catch {
            /* ignore */
        }

        // Return fallback data instead of throwing
        return this.getFallback(method);
    }

    private getFallback(method: string): unknown {
        switch (method) {
            case 'getAgentStatuses':
                return [];
            case 'getProjectInfo':
                return { dir: '.', agents: [], activeSessions: [] };
            default:
                return undefined;
        }
    }

    async getAgentStatuses(): Promise<
        Array<{
            id: string;
            label: string;
            activity: string;
            pid?: number;
        }>
    > {
        return ((await this.sendRequest('getAgentStatuses', {})) || []) as any;
    }

    async sendMail(
        from: string,
        to: string,
        subject: string,
        body: string,
        type: 'report' | 'error',
    ): Promise<void> {
        await this.sendRequest('sendMail', { from, to, subject, body, type });
    }

    async notify(message: string, type: string): Promise<void> {
        await this.sendRequest('notify', { message, type });
    }

    async getProjectInfo(): Promise<{
        dir: string;
        agents: string[];
        activeSessions: string[];
    }> {
        return ((await this.sendRequest('getProjectInfo', {})) || {
            dir: '.',
            agents: [],
            activeSessions: [],
        }) as any;
    }

    async sendMessengerMessage(
        adapter: string,
        channel: string,
        message: string,
    ): Promise<{ success: boolean; error?: string }> {
        const result = await this.sendRequest('sendMessengerMessage', {
            adapter,
            channel,
            message,
        });
        return (
            (result as { success: boolean; error?: string }) || {
                success: false,
                error: 'Bridge timeout',
            }
        );
    }

    async getMessengerMessages(
        adapter: string,
        limit?: number,
    ): Promise<{
        messages: { sender: string; content: string; timestamp: number }[];
    }> {
        const result = await this.sendRequest('getMessengerMessages', {
            adapter,
            limit: limit ?? 10,
        });
        return (
            (result as {
                messages: {
                    sender: string;
                    content: string;
                    timestamp: number;
                }[];
            }) || { messages: [] }
        );
    }
}

// ── MCP Server (stdio) ─────────────────────────────────────────────────────

/**
 * Start the MCP server in the current process (stdio mode).
 * Called when this file is executed directly by Claude Code.
 */
export function startMcpServer(bridge: McpBridge): void {
    const rl = readline.createInterface({ input: process.stdin });

    rl.on('line', async (line) => {
        if (!line.trim()) return;
        try {
            const req = JSON.parse(line) as JsonRpcRequest;
            const response = await handleRequest(req, bridge);
            if (response) {
                process.stdout.write(JSON.stringify(response) + '\n');
            }
        } catch {
            const errorResponse: JsonRpcResponse = {
                jsonrpc: '2.0',
                id: null,
                error: { code: -32700, message: 'Parse error' },
            };
            process.stdout.write(JSON.stringify(errorResponse) + '\n');
        }
    });

    rl.on('close', () => {
        process.exit(0);
    });
}

async function handleRequest(
    req: JsonRpcRequest,
    bridge: McpBridge,
): Promise<JsonRpcResponse> {
    switch (req.method) {
        case 'initialize':
            return {
                jsonrpc: '2.0',
                id: req.id,
                result: {
                    protocolVersion: '2024-11-05',
                    capabilities: { tools: {} },
                    serverInfo: { name: 'artience-mcp', version: '1.0.0' },
                },
            };

        case 'tools/list':
            return {
                jsonrpc: '2.0',
                id: req.id,
                result: { tools: TOOLS },
            };

        case 'tools/call':
            return handleToolCall(req, bridge);

        case 'notifications/initialized':
            // JSON-RPC notification — must NOT send a response per spec
            return undefined as unknown as JsonRpcResponse;

        default:
            return {
                jsonrpc: '2.0',
                id: req.id,
                error: {
                    code: -32601,
                    message: `Method not found: ${req.method}`,
                },
            };
    }
}

async function handleToolCall(
    req: JsonRpcRequest,
    bridge: McpBridge,
): Promise<JsonRpcResponse> {
    const params = req.params as
        | { name: string; arguments?: Record<string, unknown> }
        | undefined;
    if (!params?.name) {
        return {
            jsonrpc: '2.0',
            id: req.id,
            error: { code: -32602, message: 'Missing tool name' },
        };
    }

    const args = params.arguments || {};

    try {
        switch (params.name) {
            case 'artience_notify': {
                const message = (args.message as string) || '';
                const type = (args.type as string) || 'info';
                await bridge.notify(message, type);
                return {
                    jsonrpc: '2.0',
                    id: req.id,
                    result: {
                        content: [
                            {
                                type: 'text',
                                text: `Notification sent: "${message}" (${type})`,
                            },
                        ],
                    },
                };
            }

            case 'artience_agent_status': {
                const agentId = args.agentId as string | undefined;
                const statuses = await bridge.getAgentStatuses();
                const filtered = agentId
                    ? statuses.filter(
                          (s) =>
                              s.id === agentId ||
                              s.label.toLowerCase() === agentId.toLowerCase(),
                      )
                    : statuses;
                return {
                    jsonrpc: '2.0',
                    id: req.id,
                    result: {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(filtered, null, 2),
                            },
                        ],
                    },
                };
            }

            case 'artience_send_mail': {
                const to = (args.to as string) || '';
                const subject = (args.subject as string) || '';
                const body = (args.body as string) || '';
                await bridge.sendMail(
                    'mcp-server',
                    to,
                    subject,
                    body,
                    'report',
                );
                return {
                    jsonrpc: '2.0',
                    id: req.id,
                    result: {
                        content: [
                            {
                                type: 'text',
                                text: `Mail sent to ${to}: "${subject}"`,
                            },
                        ],
                    },
                };
            }

            case 'artience_project_info': {
                const info = await bridge.getProjectInfo();
                return {
                    jsonrpc: '2.0',
                    id: req.id,
                    result: {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(info, null, 2),
                            },
                        ],
                    },
                };
            }

            case 'artience_messenger_send': {
                const adapter = (args.adapter as string) || '';
                const channel = (args.channel as string) || '';
                const msgText = (args.message as string) || '';
                const sendResult = await bridge.sendMessengerMessage(
                    adapter,
                    channel,
                    msgText,
                );
                return {
                    jsonrpc: '2.0',
                    id: req.id,
                    result: {
                        content: [
                            {
                                type: 'text',
                                text: sendResult.success
                                    ? `Message sent to ${adapter}/${channel}`
                                    : `Failed: ${sendResult.error}`,
                            },
                        ],
                    },
                };
            }

            case 'artience_messenger_receive': {
                const recvAdapter = (args.adapter as string) || '';
                const limit = (args.limit as number) || 10;
                const recvResult = await bridge.getMessengerMessages(
                    recvAdapter,
                    limit,
                );
                return {
                    jsonrpc: '2.0',
                    id: req.id,
                    result: {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(
                                    recvResult.messages,
                                    null,
                                    2,
                                ),
                            },
                        ],
                    },
                };
            }

            default:
                return {
                    jsonrpc: '2.0',
                    id: req.id,
                    error: {
                        code: -32602,
                        message: `Unknown tool: ${params.name}`,
                    },
                };
        }
    } catch (err: any) {
        return {
            jsonrpc: '2.0',
            id: req.id,
            error: {
                code: -32000,
                message: err.message || 'Tool execution failed',
            },
        };
    }
}

// ── .mcp.json 등록 함수 ─────────────────────────────────────────────────────

/**
 * Register the Artience MCP server in the project's .mcp.json.
 * Claude Code reads .mcp.json to discover available MCP servers.
 */
export function registerMcpServer(projectDir: string): void {
    const mcpConfigPath = path.join(projectDir, '.mcp.json');

    let config: Record<string, unknown> = {};
    try {
        if (fs.existsSync(mcpConfigPath)) {
            config = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf-8'));
        }
    } catch {
        config = {};
    }

    const mcpServers = (config.mcpServers || {}) as Record<string, unknown>;

    // Only write if not already registered
    if (mcpServers['artience']) return;

    // The MCP server script path — relative to project root won't work,
    // so we use the absolute path of the compiled script.
    const serverScriptPath = path.join(__dirname, 'mcp-artience-server.js');

    mcpServers['artience'] = {
        command: 'node',
        args: [serverScriptPath],
        env: {},
    };

    config.mcpServers = mcpServers;

    try {
        fs.writeFileSync(
            mcpConfigPath,
            JSON.stringify(config, null, 2),
            'utf-8',
        );
        console.log(`[MCP] Registered artience server in ${mcpConfigPath}`);
    } catch (err: any) {
        console.warn(`[MCP] Failed to register in .mcp.json:`, err.message);
    }
}

/**
 * Unregister the Artience MCP server from .mcp.json.
 */
export function unregisterMcpServer(projectDir: string): void {
    const mcpConfigPath = path.join(projectDir, '.mcp.json');

    try {
        if (!fs.existsSync(mcpConfigPath)) return;
        const config = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf-8'));
        const mcpServers = config.mcpServers as
            | Record<string, unknown>
            | undefined;
        if (!mcpServers?.['artience']) return;

        delete mcpServers['artience'];
        config.mcpServers = mcpServers;
        fs.writeFileSync(
            mcpConfigPath,
            JSON.stringify(config, null, 2),
            'utf-8',
        );
        console.log(`[MCP] Unregistered artience server from ${mcpConfigPath}`);
    } catch {
        // silently ignore
    }
}

// ── Standalone Entry Point ──────────────────────────────────────────────────

/**
 * When executed directly by Claude Code (`node mcp-artience-server.js`),
 * use file-based IPC bridge to communicate with Electron main process.
 */
if (require.main === module) {
    const bridge = new FileBridge();
    startMcpServer(bridge);
}
