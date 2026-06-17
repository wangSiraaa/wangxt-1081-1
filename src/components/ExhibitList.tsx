import { useState } from 'react';
import type { Exhibit, Task, ExhibitStatus } from '../../../shared/types';
import {
  exhibitStatusLabel,
  exhibitStatusColor,
} from '../utils/formatters';
import {
  Thermometer,
  Droplets,
  CheckCircle2,
  Clock,
  Trash2,
  Star,
  Shield,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
} from 'lucide-react';

interface Props {
  exhibits: Exhibit[];
  tasks: Task[];
  readOnly: boolean;
  onConfirmThermostat: (id: string, confirmedBy: string) => Promise<void>;
  onConfirmRestoration: (id: string, confirmedBy: string, reason?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export default function ExhibitList({ exhibits, tasks, readOnly, onConfirmThermostat, onConfirmRestoration, onDelete }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [restorationReasonId, setRestorationReasonId] = useState<string | null>(null);
  const [restorationReason, setRestorationReason] = useState('');

  if (exhibits.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <Droplets className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <div className="text-slate-500 font-medium">暂无展品</div>
        <div className="text-sm text-slate-400 mt-1">点击右上角「添加展品」创建第一件作品</div>
      </div>
    );
  }

  const keyExhibits = exhibits.filter((e) => e.is_key_exhibit);
  const normalExhibits = exhibits.filter((e) => !e.is_key_exhibit);

  return (
    <div className="space-y-6">
      {keyExhibits.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
            重点展品 ({keyExhibits.length})
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {keyExhibits.map((e) => (
              <ExhibitCard
                key={e.id}
                exhibit={e}
                tasks={tasks}
                isKey
                expanded={expandedId === e.id}
                onToggleExpand={() => setExpandedId(expandedId === e.id ? null : e.id)}
                readOnly={readOnly}
                showRestorationReason={restorationReasonId === e.id}
                restorationReason={restorationReason}
                setRestorationReasonId={setRestorationReasonId}
                setRestorationReason={setRestorationReason}
                onConfirmThermostat={onConfirmThermostat}
                onConfirmRestoration={onConfirmRestoration}
                onDelete={onDelete}
              />
            ))}
          </div>
        </div>
      )}
      {normalExhibits.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2">
            <Droplets className="w-4 h-4 text-slate-400" />
            常规展品 ({normalExhibits.length})
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {normalExhibits.map((e) => (
              <ExhibitCard
                key={e.id}
                exhibit={e}
                tasks={tasks}
                isKey={false}
                expanded={expandedId === e.id}
                onToggleExpand={() => setExpandedId(expandedId === e.id ? null : e.id)}
                readOnly={readOnly}
                showRestorationReason={restorationReasonId === e.id}
                restorationReason={restorationReason}
                setRestorationReasonId={setRestorationReasonId}
                setRestorationReason={setRestorationReason}
                onConfirmThermostat={onConfirmThermostat}
                onConfirmRestoration={onConfirmRestoration}
                onDelete={onDelete}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ExhibitCard({
  exhibit, tasks, isKey, expanded, onToggleExpand, readOnly,
  showRestorationReason, restorationReason, setRestorationReasonId, setRestorationReason,
  onConfirmThermostat, onConfirmRestoration, onDelete,
}: {
  exhibit: Exhibit;
  tasks: Task[];
  isKey: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  readOnly: boolean;
  showRestorationReason: boolean;
  restorationReason: string;
  setRestorationReasonId: (id: string | null) => void;
  setRestorationReason: (s: string) => void;
  onConfirmThermostat: (id: string, confirmedBy: string) => Promise<void>;
  onConfirmRestoration: (id: string, confirmedBy: string, reason?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const placementTask = tasks.find((t) => t.id === exhibit.placement_task_id);

  return (
    <div className={`bg-white rounded-2xl border overflow-hidden transition ${
      isKey ? 'border-amber-200 shadow-sm shadow-amber-50' : 'border-slate-200'
    }`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {isKey && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 flex-shrink-0" />}
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${exhibitStatusColor(exhibit.status as ExhibitStatus)}`}>
                {exhibitStatusLabel(exhibit.status as ExhibitStatus)}
              </span>
              {exhibit.needs_thermostat && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-600 inline-flex items-center gap-1">
                  <Thermometer className="w-2.5 h-2.5" />
                  恒温
                </span>
              )}
            </div>
            <h4 className="font-semibold text-slate-800 truncate">{exhibit.name}</h4>
            {(exhibit.artist || exhibit.year) && (
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                {exhibit.artist}
                {exhibit.artist && exhibit.year && ' · '}
                {exhibit.year}
              </p>
            )}
            {exhibit.position && (
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                <Shield className="w-3 h-3" />
                {exhibit.position}
              </p>
            )}
          </div>
          <button
            onClick={onToggleExpand}
            className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition flex-shrink-0"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {exhibit.needs_thermostat && (
            <div className={`p-2 rounded-lg ${exhibit.thermostat_confirmed ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <div className="text-[11px] text-slate-500 flex items-center gap-1 mb-0.5">
                <Thermometer className="w-3 h-3" /> 恒温确认
              </div>
              {exhibit.thermostat_confirmed ? (
                <div className="text-xs font-medium text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> 已确认
                  {exhibit.thermostat_confirmed_at && (
                    <span className="text-emerald-500 ml-auto opacity-75">
                      {exhibit.thermostat_confirmed_at.substring(5, 16).replace('T', ' ')}
                    </span>
                  )}
                </div>
              ) : (
                <div className="text-xs text-red-600 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> 待确认
                  {!readOnly && (
                    <button
                      onClick={() => onConfirmThermostat(exhibit.id, 'curator')}
                      className="ml-auto px-2 py-0.5 bg-red-600 text-white rounded hover:bg-red-700 transition text-[11px]"
                    >
                      确认
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {isKey && (
            <div className={`p-2 rounded-lg ${exhibit.restoration_confirmed ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <div className="text-[11px] text-slate-500 flex items-center gap-1 mb-0.5">
                <Droplets className="w-3 h-3" /> 修复确认
              </div>
              {exhibit.restoration_confirmed ? (
                <div className="text-xs font-medium text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> 已确认
                  {exhibit.restoration_confirmed_at && (
                    <span className="text-emerald-500 ml-auto opacity-75">
                      {exhibit.restoration_confirmed_at.substring(5, 16).replace('T', ' ')}
                    </span>
                  )}
                </div>
              ) : (
                <div className="text-xs text-red-600 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> 待确认
                  {!readOnly && !showRestorationReason && (
                    <button
                      onClick={() => {
                        setRestorationReasonId(exhibit.id);
                        setRestorationReason('');
                      }}
                      className="ml-auto px-2 py-0.5 bg-red-600 text-white rounded hover:bg-red-700 transition text-[11px] flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> 确认
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {isKey && !exhibit.restoration_confirmed && showRestorationReason && (
          <div className="mt-3 p-3 bg-slate-50 rounded-xl space-y-2">
            <textarea
              value={restorationReason}
              onChange={(e) => setRestorationReason(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 resize-none"
              placeholder="修复说明（可选）：表面裂痕补漆、画框加固、背板更换..."
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setRestorationReasonId(null);
                  setRestorationReason('');
                }}
                className="px-3 py-1.5 text-xs border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-100 transition flex items-center gap-1"
              >
                <X className="w-3 h-3" /> 取消
              </button>
              <button
                onClick={() => {
                  onConfirmRestoration(exhibit.id, 'curator', restorationReason.trim() || undefined);
                  setRestorationReasonId(null);
                  setRestorationReason('');
                }}
                className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition flex items-center gap-1"
              >
                <CheckCircle2 className="w-3 h-3" /> 确认修复完成
              </button>
            </div>
          </div>
        )}
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-slate-100 space-y-2 bg-slate-50">
          {placementTask && (
            <div className="text-xs p-2 bg-white rounded-lg border border-slate-100">
              <span className="text-slate-500">关联展陈任务：</span>
              <span className="text-indigo-700 font-medium ml-1">{placementTask.title}</span>
            </div>
          )}
          {exhibit.thermostat_confirmed_by && (
            <div className="text-xs text-slate-500">
              恒温确认人：<span className="text-slate-700">{exhibit.thermostat_confirmed_by}</span>
            </div>
          )}
          {exhibit.restoration_confirmed_by && (
            <div className="text-xs text-slate-500">
              修复确认人：<span className="text-slate-700">{exhibit.restoration_confirmed_by}</span>
            </div>
          )}
          {!readOnly && (
            <div className="flex justify-end pt-2">
              <button
                onClick={() => onDelete(exhibit.id)}
                className="text-red-500 hover:text-red-600 text-xs flex items-center gap-1 px-2 py-1 rounded hover:bg-red-50 transition"
              >
                <Trash2 className="w-3 h-3" /> 删除展品
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
