import React, { useState, useEffect } from 'react';
import { Plus, X, CheckCircle, Clock, User, Loader2 } from 'lucide-react';
import { useRoomStore, type RoomTask, type TaskStatus } from '../../store/useRoomStore';

// ── Status styling ──

const STATUS_STYLES: Record<TaskStatus, { bg: string; text: string; label: string }> = {
    pending: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'Pending' },
    assigned: { bg: 'bg-blue-50', text: 'text-blue-600', label: 'Assigned' },
    in_progress: { bg: 'bg-yellow-50', text: 'text-yellow-600', label: 'In Progress' },
    completed: { bg: 'bg-green-50', text: 'text-green-600', label: 'Completed' },
};

const STATUS_ICONS: Record<TaskStatus, React.ReactNode> = {
    pending: <Clock size={10} />,
    assigned: <User size={10} />,
    in_progress: <Loader2 size={10} className="animate-spin" />,
    completed: <CheckCircle size={10} />,
};

// ── Create Task Modal ──

interface CreateTaskModalProps {
    open: boolean;
    onClose: () => void;
}

const CreateTaskModal: React.FC<CreateTaskModalProps> = ({ open, onClose }) => {
    const [title, setTitle] = useState('');
    const [prompt, setPrompt] = useState('');
    const createTask = useRoomStore((s) => s.createTask);
    const loading = useRoomStore((s) => s.loading);

    const handleSubmit = async () => {
        if (!title.trim()) return;
        await createTask(title.trim(), prompt.trim() || undefined);
        if (!useRoomStore.getState().error) {
            setTitle('');
            setPrompt('');
            onClose();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey && e.target instanceof HTMLInputElement) {
            e.preventDefault();
            handleSubmit();
        }
        if (e.key === 'Escape') onClose();
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-full max-w-md bg-white border-4 border-black rounded-2xl shadow-[6px_6px_0_0_#000] p-5">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-black text-base text-black">New Task</h3>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center rounded-lg border-2 border-black bg-white hover:bg-gray-100 active:translate-y-0.5 transition-all"
                    >
                        <X size={14} />
                    </button>
                </div>

                <div className="space-y-3">
                    <div>
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider">
                            Task Title
                        </label>
                        <input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Build login page..."
                            className="w-full mt-1 px-3 py-2 text-sm font-bold border-2 border-black rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#FFD100]"
                            autoFocus
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider">
                            Prompt / Description (optional)
                        </label>
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Detailed requirements for the AI agent..."
                            rows={4}
                            className="w-full mt-1 px-3 py-2 text-sm font-medium border-2 border-black rounded-lg bg-white resize-none focus:outline-none focus:ring-2 focus:ring-[#FFD100]"
                        />
                    </div>
                </div>

                <div className="flex gap-2 mt-5">
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="flex-1 py-2.5 text-xs font-black border-2 border-black rounded-lg bg-white shadow-[2px_2px_0_0_#000] hover:shadow-[3px_3px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading || !title.trim()}
                        className="flex-1 py-2.5 text-xs font-black text-white border-2 border-black rounded-lg bg-[#A78BFA] shadow-[2px_2px_0_0_#000] hover:shadow-[3px_3px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-50"
                    >
                        {loading ? 'Creating...' : 'Create & Assign'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Task Card ──

const TaskCard: React.FC<{ task: RoomTask }> = ({ task }) => {
    const style = STATUS_STYLES[task.status];
    const icon = STATUS_ICONS[task.status];

    return (
        <div className="p-3 rounded-lg border-2 border-black bg-white shadow-[1px_1px_0_0_#000]">
            <div className="flex items-start justify-between gap-2 mb-1.5">
                <span className="text-xs font-black flex-1 leading-tight">{task.title}</span>
                <span
                    className={`flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded border border-black shrink-0 ${style.bg} ${style.text}`}
                >
                    {icon}
                    {style.label}
                </span>
            </div>
            {task.assigneeName && (
                <div className="flex items-center gap-1 text-[10px] text-gray-500">
                    <User size={10} />
                    <span className="font-bold">{task.assigneeName}</span>
                </div>
            )}
            {task.prompt && (
                <p className="text-[10px] text-gray-400 mt-1 line-clamp-2">{task.prompt}</p>
            )}
        </div>
    );
};

// ── Main Component ──

export const TaskInputPanel: React.FC = () => {
    const [createOpen, setCreateOpen] = useState(false);
    const [filter, setFilter] = useState<'all' | TaskStatus>('all');

    const tasks = useRoomStore((s) => s.tasks);
    const myRole = useRoomStore((s) => s.myRole);
    const fetchTasks = useRoomStore((s) => s.fetchTasks);

    const isCTO = myRole === 'CTO';

    useEffect(() => {
        fetchTasks();
    }, [fetchTasks]);

    const filteredTasks = filter === 'all'
        ? tasks
        : tasks.filter((t) => t.status === filter);

    const counts: Record<TaskStatus, number> = {
        pending: tasks.filter((t) => t.status === 'pending').length,
        assigned: tasks.filter((t) => t.status === 'assigned').length,
        in_progress: tasks.filter((t) => t.status === 'in_progress').length,
        completed: tasks.filter((t) => t.status === 'completed').length,
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="p-3 border-b-2 border-black bg-[#A78BFA]/10">
                <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black text-black uppercase tracking-wider">
                        Tasks ({tasks.length})
                    </h3>
                    {isCTO && (
                        <button
                            onClick={() => setCreateOpen(true)}
                            className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-black text-white bg-[#A78BFA] border-2 border-black rounded-lg shadow-[1px_1px_0_0_#000] hover:shadow-[2px_2px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all"
                        >
                            <Plus size={12} />
                            New Task
                        </button>
                    )}
                </div>

                {/* Progress bar */}
                {tasks.length > 0 && (
                    <div className="mt-2">
                        <div className="flex gap-0.5 h-2 rounded-full overflow-hidden border border-black">
                            {counts.completed > 0 && (
                                <div
                                    className="bg-green-400 transition-all"
                                    style={{ width: `${(counts.completed / tasks.length) * 100}%` }}
                                />
                            )}
                            {counts.in_progress > 0 && (
                                <div
                                    className="bg-yellow-400 transition-all"
                                    style={{ width: `${(counts.in_progress / tasks.length) * 100}%` }}
                                />
                            )}
                            {counts.assigned > 0 && (
                                <div
                                    className="bg-blue-400 transition-all"
                                    style={{ width: `${(counts.assigned / tasks.length) * 100}%` }}
                                />
                            )}
                            {counts.pending > 0 && (
                                <div
                                    className="bg-gray-200 transition-all"
                                    style={{ width: `${(counts.pending / tasks.length) * 100}%` }}
                                />
                            )}
                        </div>
                        <div className="flex justify-between mt-1">
                            <span className="text-[9px] font-bold text-gray-400">
                                {counts.completed}/{tasks.length} done
                            </span>
                            <span className="text-[9px] font-bold text-gray-400">
                                {Math.round((counts.completed / tasks.length) * 100)}%
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Filter tabs */}
            <div className="flex border-b border-gray-200 px-1 pt-1">
                {(['all', 'pending', 'assigned', 'in_progress', 'completed'] as const).map((f) => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-2 py-1 text-[9px] font-black uppercase tracking-wider transition-colors ${
                            filter === f
                                ? 'text-black border-b-2 border-black'
                                : 'text-gray-300 hover:text-gray-500'
                        }`}
                    >
                        {f === 'all' ? `All (${tasks.length})` : f === 'in_progress' ? `Active (${counts.in_progress})` : `${f} (${counts[f]})`}
                    </button>
                ))}
            </div>

            {/* Task List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                {filteredTasks.length > 0 ? (
                    filteredTasks.map((task) => (
                        <TaskCard key={task.id} task={task} />
                    ))
                ) : (
                    <div className="text-center py-8">
                        <p className="text-xs font-bold text-gray-300">
                            {filter === 'all' ? 'No tasks yet' : `No ${filter} tasks`}
                        </p>
                        {isCTO && filter === 'all' && (
                            <button
                                onClick={() => setCreateOpen(true)}
                                className="mt-2 text-[10px] font-black text-[#A78BFA] underline"
                            >
                                Create your first task
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Create Task Modal */}
            <CreateTaskModal open={createOpen} onClose={() => setCreateOpen(false)} />
        </div>
    );
};
