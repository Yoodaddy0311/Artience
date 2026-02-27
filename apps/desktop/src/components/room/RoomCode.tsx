import React, { useState } from 'react';
import { Copy, Check, Share2 } from 'lucide-react';

interface RoomCodeProps {
    code: string;
    roomName: string;
}

export const RoomCode: React.FC<RoomCodeProps> = ({ code, roomName }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback for non-secure contexts
            const ta = document.createElement('textarea');
            ta.value = code;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleShare = async () => {
        const shareData = {
            title: `Join ${roomName}`,
            text: `Join my Dokba Town room "${roomName}" with code: ${code}`,
        };
        try {
            if (navigator.share) {
                await navigator.share(shareData);
            } else {
                await navigator.clipboard.writeText(shareData.text);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }
        } catch {
            // User cancelled share
        }
    };

    return (
        <div className="p-4 rounded-xl border-4 border-black bg-white shadow-[4px_4px_0_0_#000]">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">
                Invite Code
            </p>

            {/* Large code display */}
            <div className="flex items-center justify-center gap-1.5 mb-3">
                {code.split('').map((char, i) => (
                    <span
                        key={i}
                        className="w-9 h-11 flex items-center justify-center text-lg font-black bg-gray-50 border-2 border-black rounded-lg shadow-[1px_1px_0_0_#000]"
                    >
                        {char}
                    </span>
                ))}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
                <button
                    onClick={handleCopy}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-black border-2 border-black rounded-lg shadow-[2px_2px_0_0_#000] hover:shadow-[3px_3px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all ${
                        copied
                            ? 'bg-[#22C55E] text-white'
                            : 'bg-white text-black'
                    }`}
                >
                    {copied ? (
                        <>
                            <Check size={14} />
                            Copied
                        </>
                    ) : (
                        <>
                            <Copy size={14} />
                            Copy Code
                        </>
                    )}
                </button>
                <button
                    onClick={handleShare}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-black bg-[#60A5FA] text-white border-2 border-black rounded-lg shadow-[2px_2px_0_0_#000] hover:shadow-[3px_3px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all"
                >
                    <Share2 size={14} />
                    Share
                </button>
            </div>
        </div>
    );
};
