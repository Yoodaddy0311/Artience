import React from 'react';
import { FilePlus, FileEdit, Trash2 } from 'lucide-react';

/** Icon map for file change actions (create / modify / delete). */
export const FILE_ACTION_ICON: Record<
    'created' | 'modified' | 'deleted',
    React.ReactNode
> = {
    created: <FilePlus className="w-3.5 h-3.5 text-green-600" />,
    modified: <FileEdit className="w-3.5 h-3.5 text-yellow-600" />,
    deleted: <Trash2 className="w-3.5 h-3.5 text-red-600" />,
};
