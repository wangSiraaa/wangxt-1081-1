import type { TaskAuditLog } from '../../../shared/types';
import {
  auditLogTypeLabel,
  auditLogTypeColor,
} from '../utils/formatters';
import {
  History,
  User,
  ChevronRight,
} from 'lucide-react';

interface Props {
  logs: TaskAuditLog[];
  expanded?: boolean;
}

export default function AuditLogList({ logs, expanded = false }: Props) {
  if (logs.length === 0 && !expanded) {
    return (
      <div className="text-xs text-slate-400 p-2">暂无变更记录</div>
    );
  }

  if (logs.length === 0 && expanded) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6 text-center">
        <History className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <div className="text-sm text-slate-500">暂无审计记录</div>
        <div className="text-xs text-slate-400 mt-1">所有改期、复核、封闭、异常操作都会在此记录</div>
      </div>
    );
  }

  const sorted = [...logs].sort((a, b) =>
    new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  );

  if (!expanded) {
    return (
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {sorted.slice(0, 5).map((log) => (
          <AuditLogItem key={log.id} log={log} compact />
        ))}
        {sorted.length > 5 && (
          <div className="text-xs text-slate-400 text-center pt-1">
            共 {sorted.length} 条记录，仅显示最新 5 条
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex items-center gap-2">
        <History className="w-4 h-4 text-slate-400" />
        <span className="font-semibold text-slate-700">变更审计日志</span>
        <span className="text-xs text-slate-400 ml-auto">{sorted.length} 条记录</span>
      </div>
      <div className="divide-y divide-slate-50">
        {sorted.map((log) => (
          <AuditLogItem key={log.id} log={log} />
        ))}
      </div>
    </div>
  );
}

function AuditLogItem({ log, compact = false }: { log: TaskAuditLog; compact?: boolean }) {
  const created = log.created_at ? new Date(log.created_at) : null;
  const dateStr = created
    ? `${created.getMonth() + 1}/${created.getDate()} ${String(created.getHours()).padStart(2, '0')}:${String(created.getMinutes()).padStart(2, '0')}`
    : '';

  if (compact) {
    return (
      <div className="flex items-start gap-2 text-xs p-2 hover:bg-slate-50 rounded">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${auditLogTypeColor(log.log_type)}`}>
          {auditLogTypeLabel(log.log_type)}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-slate-700 truncate">
            {log.reason || (log.new_value ? `${log.old_value || '空'} → ${log.new_value}` : '无详细说明')}
          </div>
        </div>
        <span className="text-slate-400 flex-shrink-0">{dateStr}</span>
      </div>
    );
  }

  return (
    <div className="p-4 hover:bg-slate-50/50 transition">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
          <User className="w-4 h-4 text-slate-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${auditLogTypeColor(log.log_type)}`}>
              {auditLogTypeLabel(log.log_type)}
            </span>
            <span className="text-sm font-medium text-slate-700">{log.changed_by || '系统'}</span>
            <ChevronRight className="w-3 h-3 text-slate-300" />
            <span className="text-xs text-slate-500">
              {log.task_id && log.task_id.startsWith('exhibit_') ? '展品变更' : `任务 ${log.task_id.substring(0, 10)}`}
            </span>
          </div>

          {log.old_value || log.new_value ? (
            <div className="mt-2 flex items-center gap-2 text-xs flex-wrap">
              {log.old_value && (
                <span className="px-2 py-1 bg-slate-100 text-slate-500 rounded-lg max-w-xs truncate">
                  {log.old_value}
                </span>
              )}
              <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
              {log.new_value && (
                <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg max-w-xs truncate">
                  {log.new_value}
                </span>
              )}
            </div>
          ) : null}

          {log.reason && (
            <div className="mt-2 text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
              {log.reason}
            </div>
          )}
        </div>
        <span className="text-xs text-slate-400 flex-shrink-0 pt-1">{dateStr}</span>
      </div>
    </div>
  );
}
