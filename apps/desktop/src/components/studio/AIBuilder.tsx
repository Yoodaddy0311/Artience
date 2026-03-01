import React, { useState, useRef, useEffect } from 'react';
import { useAppStore, type AiBuilderMessage } from '../../store/useAppStore';

type BuildScope = 'theme' | 'world' | 'agents' | 'recipes' | 'all';

const SCOPE_INFO: Record<BuildScope, { emoji: string; label: string; desc: string }> = {
    theme: { emoji: '!', label: 'Theme', desc: 'Color/Font/Style' },
    world: { emoji: 'W', label: 'World', desc: 'Room/Wall/Tile Layout' },
    agents: { emoji: 'A', label: 'Agents', desc: '25 Profiles/Sprites' },
    recipes: { emoji: 'R', label: 'Recipes', desc: 'CLI Script Definitions' },
    all: { emoji: '*', label: 'All', desc: 'Theme+World+Agents+Recipes' },
};

const TEMPLATE_PROMPTS = [
    { label: 'Office Layout', prompt: 'Generate a basic office layout. Divide into dev team, design team, and planning team areas, then place meeting rooms and break rooms.' },
    { label: 'Theme Change', prompt: 'Change the office theme. Configure a new color palette, floor material, and wallpaper style.' },
    { label: 'Agent Setup', prompt: 'Set up the agent team. Assign appropriate members per role and configure their sprites and profiles.' },
    { label: 'Recipe Define', prompt: 'Define automation recipes. Set up key CLI commands and scripts.' },
];

interface AIBuilderProps {
    onDraftGenerated?: () => void;
}

export const AIBuilder: React.FC<AIBuilderProps> = ({ onDraftGenerated }) => {
    const aiBuilderMessages = useAppStore((s) => s.aiBuilderMessages);
    const addAiBuilderMessage = useAppStore((s) => s.addAiBuilderMessage);
    const clearAiBuilderMessages = useAppStore((s) => s.clearAiBuilderMessages);

    const [input, setInput] = useState('');
    const [scope, setScope] = useState<BuildScope>('all');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generateError, setGenerateError] = useState<string | null>(null);
    const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Seed system message if empty
    useEffect(() => {
        if (aiBuilderMessages.length === 0) {
            addAiBuilderMessage({
                id: 'sys-0',
                role: 'system',
                content: 'Hello! I am the AI Builder.\nWhat would you like to create? Select a template below or type your own prompt.',
                timestamp: Date.now(),
            });
        }
    }, []);

    const scrollToBottom = () => {
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    };

    const sendMessage = async (text: string) => {
        if (!text.trim() || isGenerating) return;

        const userMsg: AiBuilderMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: text,
            timestamp: Date.now(),
        };
        addAiBuilderMessage(userMsg);
        setInput('');
        setIsGenerating(true);
        setGenerateError(null);
        setLastFailedPrompt(null);
        scrollToBottom();

        const studioApi = window.dogbaApi?.studio;
        if (!studioApi) {
            setGenerateError('Studio API not available.');
            setIsGenerating(false);
            return;
        }
        try {
            const result = await studioApi.generate(`[scope:${scope}] ${text}`);

            if (!result.success) {
                throw new Error(result.error || 'Generation failed');
            }

            const assistantMsg: AiBuilderMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: result.result || 'Generation complete! Check the Draft Preview.',
                timestamp: Date.now(),
            };
            addAiBuilderMessage(assistantMsg);
            setGenerateError(null);
            onDraftGenerated?.();
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            setGenerateError(errorMessage);
            setLastFailedPrompt(text);

            const errorMsg: AiBuilderMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: `Generation failed: ${errorMessage}`,
                timestamp: Date.now(),
            };
            addAiBuilderMessage(errorMsg);
        }

        setIsGenerating(false);
        scrollToBottom();
    };

    const handleRetry = () => {
        if (lastFailedPrompt) {
            sendMessage(lastFailedPrompt);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(input);
        }
    };

    return (
        <div className="flex flex-col h-full bg-white">
            {/* Header */}
            <div className="p-4 border-b-2 border-black bg-[#9DE5DC] flex items-center justify-between">
                <div>
                    <h2 className="font-black text-lg text-black">AI Builder</h2>
                    <p className="text-xs text-gray-700 mt-1">Describe your office and AI will generate it</p>
                </div>
                {aiBuilderMessages.length > 1 && (
                    <button
                        onClick={clearAiBuilderMessages}
                        className="text-[10px] font-black px-2.5 py-1.5 bg-white border-2 border-black rounded-md shadow-[1px_1px_0_0_#000] hover:shadow-[2px_2px_0_0_#000] transition-all"
                    >
                        Clear
                    </button>
                )}
            </div>

            {/* Scope Selector */}
            <div className="p-3 border-b-2 border-black bg-gray-50 flex gap-1.5 flex-wrap">
                {(Object.entries(SCOPE_INFO) as [BuildScope, typeof SCOPE_INFO['theme']][]).map(([key, info]) => (
                    <button
                        key={key}
                        onClick={() => setScope(key)}
                        className={`text-xs font-black px-2.5 py-1.5 rounded-md border-2 border-black transition-all shadow-[1px_1px_0_0_#000] ${scope === key
                                ? 'bg-[#FFD100] text-black'
                                : 'bg-white text-gray-500 hover:bg-gray-100'
                            }`}
                        title={info.desc}
                    >
                        [{info.emoji}] {info.label}
                    </button>
                ))}
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {aiBuilderMessages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] p-3 rounded-xl text-sm whitespace-pre-wrap ${msg.role === 'user'
                                ? 'bg-[#FFD100] text-black border-2 border-black shadow-[2px_2px_0_0_#000] font-bold'
                                : msg.role === 'system'
                                    ? 'bg-[#E8DAFF] text-black border-2 border-black shadow-[2px_2px_0_0_#000]'
                                    : 'bg-white text-black border-2 border-black shadow-[2px_2px_0_0_#000]'
                            }`}>
                            {msg.content}
                        </div>
                    </div>
                ))}

                {/* Loading Spinner */}
                {isGenerating && (
                    <div className="flex justify-start">
                        <div className="bg-white text-black border-2 border-black shadow-[2px_2px_0_0_#000] p-3 rounded-xl text-sm flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                            <span className="font-bold">Generating...</span>
                        </div>
                    </div>
                )}

                {/* Error + Retry */}
                {generateError && !isGenerating && (
                    <div className="flex justify-start">
                        <div className="bg-red-100 border-2 border-black shadow-[2px_2px_0_0_#000] p-3 rounded-xl text-sm max-w-[85%]">
                            <p className="font-bold text-red-700 mb-2">Error: {generateError}</p>
                            {lastFailedPrompt && (
                                <button
                                    onClick={handleRetry}
                                    className="text-xs font-black px-3 py-1.5 bg-white border-2 border-black rounded-lg shadow-[1px_1px_0_0_#000] hover:shadow-[2px_2px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all"
                                >
                                    Retry
                                </button>
                            )}
                        </div>
                    </div>
                )}

                <div ref={chatEndRef} />
            </div>

            {/* Template Prompts */}
            <div className="px-4 pb-2 flex gap-2 flex-wrap">
                {TEMPLATE_PROMPTS.map((t, i) => (
                    <button
                        key={i}
                        onClick={() => sendMessage(t.prompt)}
                        disabled={isGenerating}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg border-2 border-black bg-white shadow-[1px_1px_0_0_#000] hover:bg-[#FFF8E7] hover:shadow-[2px_2px_0_0_#000] transition-all disabled:opacity-50"
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Input */}
            <div className="p-3 border-t-2 border-black bg-gray-50 flex gap-2">
                <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Describe your office generation instructions..."
                    rows={1}
                    className="flex-1 px-3 py-2 text-sm border-2 border-black rounded-lg bg-white font-medium resize-none focus:outline-none focus:ring-2 focus:ring-[#FFD100]"
                />
                <button
                    onClick={() => sendMessage(input)}
                    disabled={isGenerating || !input.trim()}
                    className="px-4 py-2 bg-[#FFD100] text-black font-black text-sm border-2 border-black rounded-lg shadow-[2px_2px_0_0_#000] hover:shadow-[3px_3px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-50"
                >
                    Generate
                </button>
            </div>
        </div>
    );
};
