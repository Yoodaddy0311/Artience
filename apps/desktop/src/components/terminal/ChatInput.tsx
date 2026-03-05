import React, {
    useState,
    useRef,
    useCallback,
    useEffect,
    useMemo,
} from 'react';
import { assetPath } from '../../lib/assetPath';
import { useTerminalStore } from '../../store/useTerminalStore';
import { useAppStore } from '../../store/useAppStore';

// ── Types ──

interface Attachment {
    id: string;
    name: string;
    type: 'image' | 'file';
    previewUrl?: string; // Object URL for images
    filePath?: string; // absolute path after saveTempFile
    base64?: string; // raw base64 for saving
}

interface SlashCommand {
    id: string;
    label: string;
    description: string;
    source: 'native' | 'skill';
    agent?: string;
}

// Native Claude Code slash commands
const NATIVE_COMMANDS: SlashCommand[] = [
    {
        id: '/compact',
        label: '/compact',
        description: '대화 컨텍스트 압축',
        source: 'native',
    },
    {
        id: '/clear',
        label: '/clear',
        description: '대화 내용 초기화',
        source: 'native',
    },
    {
        id: '/help',
        label: '/help',
        description: '도움말 표시',
        source: 'native',
    },
    { id: '/bug', label: '/bug', description: '버그 리포트', source: 'native' },
    {
        id: '/memory',
        label: '/memory',
        description: '메모리 관리',
        source: 'native',
    },
    {
        id: '/review',
        label: '/review',
        description: '코드 리뷰',
        source: 'native',
    },
    {
        id: '/init',
        label: '/init',
        description: '프로젝트 초기화',
        source: 'native',
    },
    {
        id: '/config',
        label: '/config',
        description: '설정 관리',
        source: 'native',
    },
    {
        id: '/mcp',
        label: '/mcp',
        description: 'MCP 서버 관리',
        source: 'native',
    },
    { id: '/cost', label: '/cost', description: '비용 확인', source: 'native' },
    {
        id: '/vim',
        label: '/vim',
        description: 'Vim 모드 토글',
        source: 'native',
    },
    {
        id: '/doctor',
        label: '/doctor',
        description: '진단 실행',
        source: 'native',
    },
    {
        id: '/status',
        label: '/status',
        description: '상태 확인',
        source: 'native',
    },
    {
        id: '/terminal-setup',
        label: '/terminal-setup',
        description: '터미널 설정',
        source: 'native',
    },
    { id: '/login', label: '/login', description: '로그인', source: 'native' },
    {
        id: '/logout',
        label: '/logout',
        description: '로그아웃',
        source: 'native',
    },
    {
        id: '/team',
        label: '/team',
        description: '팀 모드 (artibot)',
        source: 'native',
    },
];

// Artibot registry command type
interface ArtibotCommand {
    command: string;
    agent: string;
}

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);
const TEXT_EXTS = new Set([
    'txt',
    'md',
    'ts',
    'tsx',
    'js',
    'jsx',
    'py',
    'json',
    'yaml',
    'yml',
    'toml',
    'css',
    'html',
    'xml',
    'sql',
    'sh',
    'bash',
    'zsh',
    'env',
    'log',
    'csv',
]);

function getFileExt(name: string): string {
    return name.split('.').pop()?.toLowerCase() || '';
}

function isImageFile(name: string): boolean {
    return IMAGE_EXTS.has(getFileExt(name));
}

function isSupportedFile(name: string): boolean {
    return IMAGE_EXTS.has(getFileExt(name)) || TEXT_EXTS.has(getFileExt(name));
}

let attachmentIdCounter = 0;

// ── SlashCommandDropdown ──

const SlashCommandDropdown: React.FC<{
    commands: SlashCommand[];
    selectedIndex: number;
    onSelect: (cmd: SlashCommand) => void;
}> = ({ commands, selectedIndex, onSelect }) => {
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = listRef.current?.children[selectedIndex] as
            | HTMLElement
            | undefined;
        el?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex]);

    if (commands.length === 0) return null;

    return (
        <div
            ref={listRef}
            className="absolute bottom-full left-0 right-0 mb-1 bg-white border-2 border-black rounded-xl shadow-[3px_3px_0_0_#000] max-h-[240px] overflow-y-auto z-50"
        >
            {commands.map((cmd, i) => (
                <button
                    key={cmd.id}
                    onMouseDown={(e) => {
                        e.preventDefault();
                        onSelect(cmd);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                        i === selectedIndex
                            ? 'bg-[#E8DAFF]'
                            : 'hover:bg-gray-50'
                    } ${i === 0 ? 'rounded-t-xl' : ''} ${i === commands.length - 1 ? 'rounded-b-xl' : ''}`}
                >
                    <span className="text-sm font-bold text-black">
                        {cmd.label}
                    </span>
                    <span className="text-xs text-gray-500 truncate flex-1">
                        {cmd.description}
                    </span>
                    {cmd.source === 'skill' && (
                        <span className="text-[9px] font-bold text-purple-500 border border-purple-300 rounded px-1">
                            skill
                        </span>
                    )}
                </button>
            ))}
        </div>
    );
};

// ── AttachmentStrip ──

const AttachmentStrip: React.FC<{
    attachments: Attachment[];
    onRemove: (id: string) => void;
}> = ({ attachments, onRemove }) => {
    if (attachments.length === 0) return null;

    return (
        <div className="flex flex-wrap gap-1.5 px-2 pt-2">
            {attachments.map((att) => (
                <div
                    key={att.id}
                    className="flex items-center gap-1 bg-gray-100 border border-gray-300 rounded-lg px-2 py-1 group"
                >
                    {att.type === 'image' && att.previewUrl && (
                        <img
                            src={att.previewUrl}
                            alt=""
                            className="w-8 h-8 rounded object-cover"
                        />
                    )}
                    {att.type === 'file' && <span className="text-xs">📄</span>}
                    <span className="text-[10px] font-bold text-gray-700 max-w-[100px] truncate">
                        {att.name}
                    </span>
                    <button
                        onClick={() => onRemove(att.id)}
                        className="w-4 h-4 flex items-center justify-center rounded-full text-gray-400 hover:bg-red-100 hover:text-red-500 text-[10px] font-bold"
                    >
                        x
                    </button>
                </div>
            ))}
        </div>
    );
};

// ── ChatInput Main Component ──

export interface ChatInputProps {
    tabId: string;
    agentSprite?: string;
    onSubmit: (message: string) => void;
    disabled?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
    tabId,
    agentSprite,
    onSubmit,
    disabled,
}) => {
    const [text, setText] = useState('');
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [isDragOver, setIsDragOver] = useState(false);
    const [slashOpen, setSlashOpen] = useState(false);
    const [slashIndex, setSlashIndex] = useState(0);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [savedText, setSavedText] = useState('');
    const [projectSkills, setProjectSkills] = useState<SlashCommand[]>([]);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const inputHistory = useTerminalStore((s) => s.inputHistory[tabId] || []);
    const projectDir = useAppStore((s) => s.appSettings.projectDir);

    // Load project skills
    useEffect(() => {
        const api = window.dogbaApi?.skill;
        if (!api || !projectDir) return;
        api.list(projectDir).then((res) => {
            if (res.success && res.skills) {
                setProjectSkills(
                    res.skills.map((sk) => ({
                        id: `/${sk.id}`,
                        label: `/${sk.name}`,
                        description: sk.description,
                        source: 'skill' as const,
                        agent: sk.agent,
                    })),
                );
            }
        });
    }, [projectDir]);

    // Load artibot registry commands
    const [artibotCommands, setArtibotCommands] = useState<ArtibotCommand[]>(
        [],
    );
    useEffect(() => {
        const api = (window as any).dogbaApi?.artibot;
        if (!api) return;

        // Initial load
        api.getRegistry().then((reg: any) => {
            if (reg?.commands) {
                setArtibotCommands(reg.commands);
            }
        });

        // Live updates when .agent/ changes
        const unsub = api.onRegistryUpdated?.((reg: any) => {
            if (reg?.commands) {
                setArtibotCommands(reg.commands);
            }
        });

        return () => unsub?.();
    }, []);

    // All slash commands (native + project skills)
    const allCommands = useMemo(
        () => [...NATIVE_COMMANDS, ...projectSkills],
        [projectSkills],
    );

    // Filtered commands based on input
    const filteredCommands = useMemo(() => {
        if (!slashOpen) return [];
        const query = text.toLowerCase();
        if (query === '/') return allCommands;
        return allCommands.filter(
            (cmd) =>
                cmd.label.toLowerCase().includes(query) ||
                cmd.description.toLowerCase().includes(query),
        );
    }, [slashOpen, text, allCommands]);

    // Auto-resize textarea
    const adjustHeight = useCallback(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        const lineHeight = 20;
        const maxHeight = lineHeight * 6;
        el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    }, []);

    useEffect(() => {
        adjustHeight();
    }, [text, adjustHeight]);

    // ── File processing helpers ──

    const processFileBlob = useCallback(
        async (file: File): Promise<Attachment | null> => {
            const ext = getFileExt(file.name);
            if (!isSupportedFile(file.name) && !file.type.startsWith('image/'))
                return null;

            const id = `att-${++attachmentIdCounter}`;
            const isImg =
                isImageFile(file.name) || file.type.startsWith('image/');

            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const base64 = reader.result as string;
                    const previewUrl = isImg
                        ? URL.createObjectURL(file)
                        : undefined;
                    resolve({
                        id,
                        name: file.name,
                        type: isImg ? 'image' : 'file',
                        previewUrl,
                        base64,
                    });
                };
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(file);
            });
        },
        [],
    );

    const saveAttachmentToTemp = useCallback(
        async (att: Attachment): Promise<string | null> => {
            if (att.filePath) return att.filePath;
            if (!att.base64) return null;
            const api = window.dogbaApi?.file;
            if (!api) return null;
            const res = await api.saveTempFile(att.base64, att.name);
            if (res.success && res.filePath) {
                att.filePath = res.filePath;
                return res.filePath;
            }
            return null;
        },
        [],
    );

    // ── Event handlers ──

    const handlePaste = useCallback(
        async (e: React.ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;

            for (const item of Array.from(items)) {
                if (item.type.startsWith('image/')) {
                    e.preventDefault();
                    const file = item.getAsFile();
                    if (!file) continue;
                    const att = await processFileBlob(file);
                    if (att) setAttachments((prev) => [...prev, att]);
                }
            }
        },
        [processFileBlob],
    );

    const handleDrop = useCallback(
        async (e: React.DragEvent) => {
            e.preventDefault();
            setIsDragOver(false);
            const files = Array.from(e.dataTransfer.files);
            const newAtts: Attachment[] = [];
            for (const file of files) {
                const att = await processFileBlob(file);
                if (att) newAtts.push(att);
            }
            if (newAtts.length > 0) {
                setAttachments((prev) => [...prev, ...newAtts]);
            }
        },
        [processFileBlob],
    );

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
    }, []);

    const handleFileSelect = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const files = Array.from(e.target.files || []);
            const newAtts: Attachment[] = [];
            for (const file of files) {
                const att = await processFileBlob(file);
                if (att) newAtts.push(att);
            }
            if (newAtts.length > 0) {
                setAttachments((prev) => [...prev, ...newAtts]);
            }
            // Reset input so same file can be selected again
            if (fileInputRef.current) fileInputRef.current.value = '';
        },
        [processFileBlob],
    );

    const removeAttachment = useCallback((id: string) => {
        setAttachments((prev) => {
            const att = prev.find((a) => a.id === id);
            if (att?.previewUrl) URL.revokeObjectURL(att.previewUrl);
            return prev.filter((a) => a.id !== id);
        });
    }, []);

    const handleSlashSelect = useCallback((cmd: SlashCommand) => {
        setText(cmd.label + ' ');
        setSlashOpen(false);
        setSlashIndex(0);
        textareaRef.current?.focus();
    }, []);

    const handleSubmit = useCallback(async () => {
        const trimmed = text.trim();
        if (!trimmed && attachments.length === 0) return;

        // Save all attachments to temp files and collect paths
        const paths: string[] = [];
        for (const att of attachments) {
            const p = await saveAttachmentToTemp(att);
            if (p) paths.push(p);
        }

        // Check if it's an artibot platform command (e.g. /team, /plan)
        const slashCmd = trimmed.startsWith('/')
            ? trimmed.split(' ')[0].slice(1)
            : null;
        const artibotCmd = slashCmd
            ? artibotCommands.find((c) => c.command === slashCmd)
            : null;

        if (artibotCmd) {
            // Route via platform IPC instead of sending to CLI PTY
            const args = trimmed.slice(slashCmd!.length + 2).trim();
            const api = (window as any).dogbaApi?.artibot;
            if (api) {
                api.executeCommand(artibotCmd.command, args);
            }
        } else {
            // Build final message: text + attachment paths
            let message = trimmed;
            if (paths.length > 0) {
                const pathList = paths.join('\n');
                message = message ? `${message}\n\n${pathList}` : pathList;
            }

            if (message) {
                onSubmit(message);
                useTerminalStore
                    .getState()
                    .addInputHistory(tabId, trimmed || paths.join(' '));
            }
        }

        // Cleanup
        for (const att of attachments) {
            if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
        }
        setText('');
        setAttachments([]);
        setHistoryIndex(-1);
        setSavedText('');
        setSlashOpen(false);

        // Reset textarea height
        requestAnimationFrame(() => {
            if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
            }
        });
    }, [
        text,
        attachments,
        onSubmit,
        tabId,
        saveAttachmentToTemp,
        artibotCommands,
    ]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            // Slash command navigation
            if (slashOpen && filteredCommands.length > 0) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSlashIndex(
                        (prev) => (prev + 1) % filteredCommands.length,
                    );
                    return;
                }
                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSlashIndex(
                        (prev) =>
                            (prev - 1 + filteredCommands.length) %
                            filteredCommands.length,
                    );
                    return;
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSlashSelect(filteredCommands[slashIndex]);
                    return;
                }
                if (e.key === 'Escape') {
                    e.preventDefault();
                    setSlashOpen(false);
                    return;
                }
            }

            // Input history navigation (only when textarea is empty or browsing history)
            if (e.key === 'ArrowUp' && !e.shiftKey && !slashOpen) {
                const cursorAtStart =
                    textareaRef.current?.selectionStart === 0 &&
                    textareaRef.current?.selectionEnd === 0;
                const isBrowsing = historyIndex >= 0;
                if (
                    (text === '' || isBrowsing) &&
                    cursorAtStart &&
                    inputHistory.length > 0
                ) {
                    e.preventDefault();
                    if (historyIndex < 0) setSavedText(text);
                    const newIdx =
                        historyIndex < 0
                            ? inputHistory.length - 1
                            : Math.max(0, historyIndex - 1);
                    setHistoryIndex(newIdx);
                    setText(inputHistory[newIdx]);
                    return;
                }
            }
            if (
                e.key === 'ArrowDown' &&
                !e.shiftKey &&
                !slashOpen &&
                historyIndex >= 0
            ) {
                e.preventDefault();
                if (historyIndex >= inputHistory.length - 1) {
                    setHistoryIndex(-1);
                    setText(savedText);
                } else {
                    const newIdx = historyIndex + 1;
                    setHistoryIndex(newIdx);
                    setText(inputHistory[newIdx]);
                }
                return;
            }

            // Enter = submit, Shift+Enter = newline
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
                return;
            }
        },
        [
            slashOpen,
            filteredCommands,
            slashIndex,
            handleSlashSelect,
            text,
            historyIndex,
            inputHistory,
            savedText,
            handleSubmit,
        ],
    );

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            const val = e.target.value;
            setText(val);

            // Reset history browsing when typing
            if (historyIndex >= 0) {
                setHistoryIndex(-1);
                setSavedText('');
            }

            // Slash command detection
            if (val.startsWith('/')) {
                setSlashOpen(true);
                setSlashIndex(0);
            } else {
                setSlashOpen(false);
            }
        },
        [historyIndex],
    );

    return (
        <div
            className="relative bg-white border-t-2 border-black shrink-0"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* Slash command dropdown */}
            {slashOpen && filteredCommands.length > 0 && (
                <SlashCommandDropdown
                    commands={filteredCommands}
                    selectedIndex={slashIndex}
                    onSelect={handleSlashSelect}
                />
            )}

            {/* Attachment strip */}
            <AttachmentStrip
                attachments={attachments}
                onRemove={removeAttachment}
            />

            {/* Input row */}
            <div className="flex items-end gap-2 px-3 py-2">
                {/* Agent avatar */}
                {agentSprite && (
                    <div className="w-7 h-7 border-2 border-black rounded-lg bg-[#E8DAFF] p-0.5 flex items-center justify-center shrink-0 mb-0.5">
                        <img
                            src={assetPath(agentSprite)}
                            alt=""
                            className="w-5 h-5 object-contain"
                        />
                    </div>
                )}

                {/* Paperclip button */}
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-black rounded-lg hover:bg-gray-100 transition-colors shrink-0 mb-0.5"
                    title="파일 첨부"
                >
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                    </svg>
                </button>

                {/* Textarea */}
                <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    placeholder="메시지를 입력하세요... (/ 로 명령어)"
                    disabled={disabled}
                    rows={1}
                    className="flex-1 bg-cream-50 text-black text-sm px-3 py-2 rounded-lg border-2 border-black focus:outline-none focus:border-[#A78BFA] placeholder:text-gray-400 resize-none overflow-y-auto leading-5"
                    style={{ maxHeight: '120px' }}
                />

                {/* Send button */}
                <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={
                        disabled ||
                        (text.trim() === '' && attachments.length === 0)
                    }
                    className="px-3 py-1.5 bg-[#E8DAFF] text-black text-xs font-bold rounded-lg border-2 border-black shadow-[2px_2px_0_0_#000] hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-40 disabled:pointer-events-none mb-0.5"
                >
                    전송
                </button>
            </div>

            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.txt,.md,.ts,.tsx,.js,.jsx,.py,.json,.yaml,.yml,.toml,.css,.html,.xml,.sql,.sh,.csv,.log"
                onChange={handleFileSelect}
                className="hidden"
            />

            {/* Drag overlay */}
            {isDragOver && (
                <div className="absolute inset-0 bg-[#E8DAFF]/80 border-2 border-dashed border-[#A78BFA] rounded-lg flex items-center justify-center z-40 pointer-events-none">
                    <div className="text-center">
                        <span className="text-2xl">📎</span>
                        <p className="text-sm font-bold text-black mt-1">
                            파일을 놓으세요
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};
