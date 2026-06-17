import { useState } from 'react';
import type { Task, Exhibit, TaskStatus } from '../../../shared/types';
import {
  statusLabel,
  statusColor,
  priorityLabel,
  priorityColor,
  categoryLabel,
} from '../utils/formatters';
import {
  Clock,
  User,
  Trash2,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  CheckCircle2,
  Pause,
  Play,
  Lock,
} from 'lucide-react';

interface Props {
  task: Task;
  exhibitPlacement?: Exhibit;
  readOnly: boolean;
  allTasks: Task[];
  onProgressUpdate: (status: TaskStatus, progress?: number) => Promise<void>;
  onDelete: () => Promise<void>;
}

export default function TaskCard({ task, exhibitPlacement, readOnly, onProgressUpdate, onDelete }: Props) {
  const [showActions, setShowActions] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const progress = task.progress ?? 0;

  const handleStatusChange = async (newStatus: TaskStatus) => {
    if (readOnly) return;
    setIsUpdating(true);
    try {
      await onProgressUpdate(newStatus, progress);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleProgressChange = async (delta: number) => {
    if (readOnly) return;
    const newProgress = Math.max(0, Math.min(100, progress + delta));
    setIsUpdating(true);
    onProgressUpdate(task.status, newProgress)
      .then(() => setIsUpdating(false))
      .catch(() => setIsUpdating(false));
  };

  return (
    <>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${statusColor(task.status)}`}>
                {statusLabel(task.status)}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${priorityColor(task.priority)}`}>
                {priorityLabel(task.priority)}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                {categoryLabel(task.category)}
              </span>
            </div>
            <h4 className="font-semibold text-slate-800 truncate">{task.name}</h4>
            {task.description && (
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">{task.description}</p>
            )}
            {exhibitPlacement && (
              <div className="mt-2 text-xs text-indigo-700 bg-indigo-50 rounded-lg px-2 py-1 inline-flex items-center gap-1">
                <Lock className="w-3 h-3" />
                关联展品：{exhibitPlacement.name}
              </div>
            )}
          </div>
          <button
            onClick={() => setShowActions(!showActions)}
            className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition flex-shrink-0"
          >
            {showActions ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>

    {(task.assigned_to || task.due_date || task.progress !== undefined) && (
      <div className="px-4 pb-3 flex items-center gap-4 text-xs text-slate-500 flex-wrap">
        {task.assigned_to && (
          <span className="flex items-center gap-1">
            <User className="w-3 h-3" /> {task.assigned_to}
          </span>
        )}
        {task.due_date && (
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" /> {task.due_date.substring(0, 16).replace('T', ' ')}
          </span>
        )}
        {task.estimated_hours && task.estimated_hours > 0 && (
          <span className="flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> {task.estimated_hours}h
          </span>
        )}
      </div>
    )}

    {progress > 0 && (
      <div className="px-4 pb-3">
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="text-[11px] text-slate-400 mt-1 text-right">{progress}%</div>
      </div>
    )}

    {showActions && (
      <div className="px-4 pb-4 pt-2 border-t border-slate-100 space-y-3 bg-slate-50">
        <div className="flex flex-wrap gap-2">
          {task.status !== 'pending' && (
            <button
              onClick={() => handleStatusChange('pending')}
              disabled={readOnly || isUpdating}
              className="px-3 py-1.5 text-xs rounded-lg bg-slate-200 text-slate-700 hover:bg-slate-300 disabled:opacity-50 transition flex items-center gap-1"
            >
              <Pause className="w-3 h-3" /> 待办
            </button>
          )}
          {task.status !== 'in_progress' && (
            <button
              onClick={() => handleStatusChange('in_progress')}
              disabled={readOnly || isUpdating}
              className="px-3 py-1.5 text-xs rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-50 transition flex items-center gap-1"
            >
              <Play className="w-3 h-3" /> 开始
            </button>
          )}
          {task.status !== 'completed' && (
            <button
              onClick={() => handleStatusChange('completed')}
              disabled={readOnly || isUpdating}
              className="px-3 py-1.5 text-xs rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:opacity-50 transition flex items-center gap-1"
            >
              <CheckCircle2 className="w-3 h-3" /> 完成
            </button>
          )}
          {task.status !== 'blocked' && (
            <button
              onClick={() => handleStatusChange('blocked')}
              disabled={readOnly || isUpdating}
              className="px-3 py-1.5 text-xs rounded-lg bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 transition flex items-center gap-1"
            >
              <AlertTriangle className="w-3 h-3" /> 阻塞
            </button>
          )}
        </div>

        {task.status === 'in_progress' && (
          <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">进度：</span>
            <button
              onClick={() => handleProgressChange(-20)}
              disabled={readOnly || isUpdating}
              className="px-2 py-0.5 text-xs rounded bg-slate-200 text-slate-600 hover:bg-slate-300 disabled:opacity-50"
            >-20%</button>
            <button
              onClick={() => handleProgressChange(-10)}
              disabled={readOnly || isUpdating}
              className="px-2 py-0.5 text-xs rounded bg-slate-200 text-slate-600 hover:bg-slate-300 disabled:opacity-50"
            >-10%</button>
            <button
              onClick={() => handleProgressChange(10)}
              disabled={readOnly || isUpdating}
              className="px-2 py-0.5 text-xs rounded bg-indigo-100 text-indigo-600 hover:bg-indigo-200 disabled:opacity-50"
            >+10%</button>
            <button
              onClick={() => handleProgressChange(20)}
              disabled={readOnly || isUpdating}
              className="px-2 py-0.5 text-xs rounded bg-indigo-100 text-indigo-600 hover:bg-indigo-200 disabled:opacity-50"
            >+20%</button>
          </div>
        )}

        {!readOnly && (
          <div className="flex justify-end">
            <button
              onClick={onDelete}
              disabled={isUpdating}
              className="text-red-500 hover:text-red-600 text-xs flex items-center gap-1 px-2 py-1 rounded hover:bg-red-50 disabled:opacity-50 transition"
            >
              <Trash2 className="w-3 h-3" /> 删除任务
            </button>
          </div>
        )}
      </div>
    )}
  );
}
