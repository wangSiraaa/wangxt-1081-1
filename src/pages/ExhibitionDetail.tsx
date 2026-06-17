import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import {
  ArrowLeft,
  Plus,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  User,
  Calendar,
  Truck,
  Shield,
  Lightbulb,
  Layers,
  Thermometer,
  Droplets,
  History,
  AlertOctagon,
  Hammer,
  Users,
  ChevronDown,
  ChevronUp,
  Link2,
  X,
} from 'lucide-react';
import TaskCard from '../components/TaskCard';
import ExhibitList from '../components/ExhibitList';
import AuditLogList from '../components/AuditLogList';
import {
  statusLabel,
  phaseLabel,
  insuranceStatusLabel,
  lightingCheckLabel,
  phaseColor,
  insuranceColor,
  lightingColor,
} from '../utils/formatters';
import type {
  Task,
  TaskPhase,
  InsuranceStatus,
  LightingCheckStatus,
  CreateTaskRequest,
  AuditLogType,
  TaskAuditLog,
  ExhibitStatus,
} from '../../shared/types';

type ActiveTab = 'tasks' | 'exhibits' | 'audit';
type Phase = TaskPhase | 'unassigned';

const PHASES: { key: TaskPhase; label: string; color: string }[] = [
  { key: 'pre_exhibition', label: '预展 Pre-Exhibition', color: 'bg-indigo-500' },
  { key: 'opening', label: '开幕 Opening', color: 'bg-emerald-500' },
  { key: 'teardown', label: '撤展 Teardown', color: 'bg-rose-500' },
];

function computeRiskFlags(task: Task, allTasks: Task[]) {
  const flags: { label: string; type: 'warn' | 'danger' | 'info' }[] = [];
  const deps = task.dependencies || [];
  for (const depId of deps) {
    const dep = allTasks.find((t) => t.id === depId);
    if (dep && dep.status !== 'completed') {
      flags.push({ label: `前置任务未完成: ${dep.name.substring(0, 10)}`, type: 'danger' });
    }
  }
  if (task.earliest_start && new Date(task.earliest_start) > new Date() && task.status === 'pending') {
    flags.push({ label: `最早可开始: ${task.earliest_start.substring(0, 16)}`, type: 'warn' });
  }
  if (task.insurance_status !== 'covered' && task.insurance_status !== 'not_required') {
    flags.push({ label: `保险: ${insuranceStatusLabel(task.insurance_status as InsuranceStatus)}`, type: 'danger' });
  }
  if (task.lighting_check !== 'passed' && task.lighting_check !== 'not_required') {
    flags.push({ label: `灯光: ${lightingCheckLabel(task.lighting_check as LightingCheckStatus)}`, type: 'warn' });
  }
  if (task.hoisting_order !== null && task.category === 'installation') {
    flags.push({ label: `吊装顺序 #${task.hoisting_order}`, type: 'info' });
  }
  return flags;
}

export default function ExhibitionDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    currentExhibition,
    fetchExhibition,
    loading,
    error,
    setError,
    createTask,
    addDependency,
    removeDependency,
    deleteTask,
    updateTask,
    updateTaskProgress,
    createExhibit,
    confirmThermostat,
    confirmRestoration,
    deleteExhibit,
    confirmOpening,
    triggerAnomaly,
    resolveAnomaly,
    setTeardownResponsible,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<ActiveTab>('tasks');
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showExhibitModal, setShowExhibitModal] = useState(false);
  const [showAnomalyModal, setShowAnomalyModal] = useState(false);
  const [showTeardownModal, setShowTeardownModal] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [selectedPhase, setSelectedPhase] = useState<TaskPhase>('pre_exhibition');

  const [taskForm, setTaskForm] = useState({
    name: '',
    description: '',
    category: 'wall_install' as CreateTaskRequest['category'],
    priority: 'medium' as CreateTaskRequest['priority'],
    assignee_role: 'worker' as CreateTaskRequest['assignee_role'],
    assigned_to: '',
    due_date: '',
    estimated_hours: 4,
    phase: 'pre_exhibition' as TaskPhase,
    transport_window_start: '',
    transport_window_end: '',
    insurance_status: 'not_set' as InsuranceStatus,
    lighting_check: 'not_required' as LightingCheckStatus,
    hoisting_order: '' as string,
    dependencies: [] as string[],
  });

  const [exhibitForm, setExhibitForm] = useState({
    name: '',
    artist: '',
    year: '',
    is_key_exhibit: false,
    needs_thermostat: false,
    status: 'not_arrived' as ExhibitStatus,
    position: '',
  });

  const [anomalyReason, setAnomalyReason] = useState('');
  const [teardownPerson, setTeardownPerson] = useState('');
  const [depModalTaskId, setDepModalTaskId] = useState<string | null>(null);
  const [depTargetId, setDepTargetId] = useState('');

  useEffect(() => {
    fetchExhibition(id);
  }, [id, fetchExhibition]);

  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(null), 4000);
      return () => clearTimeout(t);
    }
  }, [error, setError]);

  const tasksByPhase = useMemo(() => {
    const map: Record<Phase, Task[]> = {
      pre_exhibition: [],
      opening: [],
      teardown: [],
      unassigned: [],
    };
    if (currentExhibition) {
      for (const t of currentExhibition.tasks) {
        const p = (t.phase || 'unassigned') as Phase;
        (map[p] || map.unassigned).push(t);
      }
    }
    return map;
  }, [currentExhibition]);

  const riskFlagsByTask = useMemo(() => {
    const m: Record<string, ReturnType<typeof computeRiskFlags>> = {};
    if (currentExhibition) {
      for (const t of currentExhibition.tasks) {
        m[t.id] = computeRiskFlags(t, currentExhibition.tasks);
      }
    }
    return m;
  }, [currentExhibition]);

  const precheck = useMemo(() => {
    if (!currentExhibition) return null;
    const keyExhibits = currentExhibition.exhibits.filter((e) => e.is_key_exhibit);
    const keyWithThermo = keyExhibits.filter((e) => e.needs_thermostat);
    const thermoPending = keyWithThermo.some((e) => !e.thermostat_confirmed);
    const restorationPending = keyExhibits.some((e) => !e.restoration_confirmed);
    const pendingTasks = (tasksByPhase.pre_exhibition || []).filter((t) => t.status !== 'completed');
    const canOpen = !thermoPending && !restorationPending && pendingTasks.length === 0;
    return {
      keyExhibits,
      keyWithThermo,
      thermoPending,
      restorationPending,
      pendingTasks,
      canOpen,
    };
  }, [currentExhibition, tasksByPhase]);

  const isReadOnly = currentExhibition?.read_only || currentExhibition?.anomaly_readonly;

  const handleCreateTask = async () => {
    if (!taskForm.name) return;
    try {
      await createTask({
        exhibition_id: id,
        name: taskForm.name,
        description: taskForm.description || null,
        category: taskForm.category,
        priority: taskForm.priority,
        assignee_role: taskForm.assignee_role,
        assigned_to: taskForm.assigned_to || null,
        due_date: taskForm.due_date || null,
        estimated_hours: taskForm.estimated_hours,
        created_by: 'user_curator_001',
        phase: taskForm.phase,
        transport_window_start: taskForm.transport_window_start || null,
        transport_window_end: taskForm.transport_window_end || null,
        insurance_status: taskForm.insurance_status,
        lighting_check: taskForm.lighting_check,
        hoisting_order: taskForm.hoisting_order ? parseInt(taskForm.hoisting_order, 10) : null,
        dependencies: taskForm.dependencies,
      });
      setShowTaskModal(false);
      setTaskForm({
        name: '',
        description: '',
        category: 'wall_install',
        priority: 'medium',
        assignee_role: 'worker',
        assigned_to: '',
        due_date: '',
        estimated_hours: 4,
        phase: 'pre_exhibition',
        transport_window_start: '',
        transport_window_end: '',
        insurance_status: 'not_set',
        lighting_check: 'not_required',
        hoisting_order: '',
        dependencies: [],
      });
    } catch {
      /* error handled via store */
    }
  };

  const handleCreateExhibit = async () => {
    if (!exhibitForm.name) return;
    try {
      await createExhibit({
        exhibition_id: id,
        name: exhibitForm.name,
        artist: exhibitForm.artist || null,
        year: exhibitForm.year ? parseInt(exhibitForm.year, 10) : null,
        is_key_exhibit: exhibitForm.is_key_exhibit,
        needs_thermostat: exhibitForm.needs_thermostat,
        created_by: 'curator',
        position: exhibitForm.position || null,
      });
      setShowExhibitModal(false);
      setExhibitForm({
        name: '',
        artist: '',
        year: '',
        is_key_exhibit: false,
        needs_thermostat: false,
        status: 'not_arrived' as never,
        position: '',
      });
    } catch {
      /* handled */
    }
  };

  const handleConfirmOpening = async () => {
    try {
      await confirmOpening(id, 'director');
    } catch {
      /* handled */
    }
  };

  const handleTriggerAnomaly = async () => {
    if (!anomalyReason.trim()) return;
    try {
      await triggerAnomaly(id, anomalyReason.trim(), 'director');
      setShowAnomalyModal(false);
      setAnomalyReason('');
    } catch {
      /* handled */
    }
  };

  const handleResolveAnomaly = async () => {
    try {
      await resolveAnomaly(id, 'director');
    } catch {
      /* handled */
    }
  };

  const handleSetTeardown = async () => {
    if (!teardownPerson.trim()) return;
    try {
      await setTeardownResponsible(id, teardownPerson.trim(), 'director');
      setShowTeardownModal(false);
      setTeardownPerson('');
    } catch {
      /* handled */
    }
  };

  const handleAddDep = async () => {
    if (!depModalTaskId || !depTargetId || depTargetId === depModalTaskId) return;
    try {
      await addDependency(depModalTaskId, depTargetId);
      setDepModalTaskId(null);
      setDepTargetId('');
    } catch {
      /* handled */
    }
  };

  if (!currentExhibition) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-slate-200 rounded w-1/3" />
          <div className="h-64 bg-slate-100 rounded" />
        </div>
      </div>
    );
  }

  const totalTasks = currentExhibition.tasks.length;
  const completedTasks = currentExhibition.tasks.filter((t) => t.status === 'completed').length;
  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {currentExhibition.anomaly_readonly && (
        <div className="bg-red-600 text-white px-6 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertOctagon className="w-5 h-5" />
              <div>
                <div className="font-semibold">温湿度异常 系统已切至只读</div>
                <div className="text-sm opacity-90">
                  原因：{currentExhibition.anomaly_reason} · 触发于 {currentExhibition.anomaly_at?.substring(0, 16)} · 撤展计划和责任人已保留
                </div>
              </div>
            </div>
            <button
              onClick={handleResolveAnomaly}
              className="px-4 py-2 bg-white text-red-700 rounded-lg font-medium hover:bg-red-50 transition"
            >
              解除异常
            </button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="p-2 hover:bg-slate-200 rounded-lg transition"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{currentExhibition.name}</h1>
              <div className="flex items-center gap-4 mt-1 text-sm text-slate-500">
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {currentExhibition.start_date?.substring(0, 10)} ~ {currentExhibition.end_date?.substring(0, 10)}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  {currentExhibition.curator || '未指派策展人'}
                </span>
                {currentExhibition.teardown_responsible && (
                  <span className="flex items-center gap-1 text-rose-700">
                    <Hammer className="w-4 h-4" />
                    撤展责任人：{currentExhibition.teardown_responsible}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!currentExhibition.teardown_responsible && !isReadOnly && (
              <button
                onClick={() => setShowTeardownModal(true)}
                className="px-4 py-2 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg font-medium transition flex items-center gap-2"
              >
                <Users className="w-4 h-4" />
                设置撤展责任人
              </button>
            )}
            {currentExhibition.read_only && (
              <div className="px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg text-sm font-medium">
                已开幕 · 只读
              </div>
            )}
            {!currentExhibition.read_only && !currentExhibition.anomaly_readonly && (
              <button
                onClick={() => setShowAnomalyModal(true)}
                className="px-4 py-2 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg font-medium transition flex items-center gap-2"
              >
                <Thermometer className="w-4 h-4" />
                触发温湿度异常
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center gap-2">
            <XCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-5 bg-white rounded-xl shadow-sm border border-slate-100">
            <div className="text-sm text-slate-500 flex items-center gap-1">
              <Layers className="w-4 h-4" /> 总任务数
            </div>
            <div className="mt-2 text-3xl font-bold text-slate-900">{totalTasks}</div>
          </div>
          <div className="p-5 bg-white rounded-xl shadow-sm border border-slate-100">
            <div className="text-sm text-slate-500 flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> 已完成
            </div>
            <div className="mt-2 text-3xl font-bold text-emerald-600">{completedTasks}</div>
          </div>
          <div className="p-5 bg-white rounded-xl shadow-sm border border-slate-100">
            <div className="text-sm text-slate-500 flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" /> 待办/进行中
            </div>
            <div className="mt-2 text-3xl font-bold text-amber-600">{totalTasks - completedTasks}</div>
          </div>
          <div className="p-5 bg-white rounded-xl shadow-sm border border-slate-100">
            <div className="text-sm text-slate-500 flex items-center gap-1">
              <Clock className="w-4 h-4" /> 整体进度
            </div>
            <div className="mt-2 flex items-end gap-2">
              <div className="text-3xl font-bold text-slate-900">{progressPct}%</div>
              <div className="flex-1 mb-1.5">
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {precheck && !currentExhibition.read_only && !currentExhibition.anomaly_readonly && (
          <div className="p-6 bg-gradient-to-br from-indigo-50 via-white to-emerald-50 rounded-2xl border border-indigo-100">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">开幕预检清单</h3>
                <p className="text-sm text-slate-500 mt-0.5">馆长确认开幕前必须全部通过</p>
              </div>
              <button
                onClick={handleConfirmOpening}
                disabled={!precheck.canOpen}
                className={`px-6 py-2.5 rounded-xl font-semibold transition flex items-center gap-2 ${
                  precheck.canOpen
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-200'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                <CheckCircle2 className="w-5 h-5" />
                馆长确认开幕
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div
                className={`p-4 rounded-xl border ${
                  precheck.keyWithThermo.length === 0 || !precheck.thermoPending
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-red-50 border-red-200'
                }`}
              >
                <div className="flex items-center gap-2 font-medium text-slate-700">
                  <Thermometer className="w-4 h-4" />
                  重点展品恒温柜确认
                </div>
                <div className="mt-2 text-sm">
                  {precheck.keyWithThermo.filter((e) => e.thermostat_confirmed).length} / {precheck.keyWithThermo.length} 已确认
                </div>
              </div>
              <div
                className={`p-4 rounded-xl border ${
                  precheck.keyExhibits.length === 0 || !precheck.restorationPending
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-red-50 border-red-200'
                }`}
              >
                <div className="flex items-center gap-2 font-medium text-slate-700">
                  <Droplets className="w-4 h-4" />
                  重点展品修复确认
                </div>
                <div className="mt-2 text-sm">
                  {precheck.keyExhibits.filter((e) => e.restoration_confirmed).length} / {precheck.keyExhibits.length} 已确认
                </div>
              </div>
              <div
                className={`p-4 rounded-xl border ${
                  precheck.pendingTasks.length === 0
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-red-50 border-red-200'
                }`}
              >
                <div className="flex items-center gap-2 font-medium text-slate-700">
                  <Layers className="w-4 h-4" />
                  预展阶段任务
                </div>
                <div className="mt-2 text-sm">
                  {tasksByPhase.pre_exhibition.filter((t) => t.status === 'completed').length} / {tasksByPhase.pre_exhibition.length} 已完成
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 border-b border-slate-200">
          {[
            { key: 'tasks', label: '任务看板 · 分阶段', icon: Layers },
            { key: 'exhibits', label: '展品管理', icon: Droplets },
            { key: 'audit', label: '变更审计日志', icon: History },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key as ActiveTab)}
              className={`px-5 py-3 font-medium transition flex items-center gap-2 border-b-2 -mb-px ${
                activeTab === t.key
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === 'tasks' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {PHASES.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setSelectedPhase(p.key)}
                    className={`px-4 py-2 rounded-lg font-medium text-sm transition flex items-center gap-2 ${
                      selectedPhase === p.key
                        ? 'bg-slate-900 text-white'
                        : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${p.color}`} />
                    {p.label}
                    <span className={`text-xs ${selectedPhase === p.key ? 'opacity-75' : 'text-slate-400'}`}>
                      {tasksByPhase[p.key]?.length || 0}
                    </span>
                  </button>
                ))}
              </div>
              {!isReadOnly && (
                <button
                  onClick={() => {
                    setTaskForm((f) => ({ ...f, phase: selectedPhase }));
                    setShowTaskModal(true);
                  }}
                  className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition flex items-center gap-2 shadow-lg shadow-indigo-200"
                >
                  <Plus className="w-5 h-5" />
                  创建展区任务
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              {PHASES.map((phase) => {
                const tasks = tasksByPhase[phase.key] || [];
                const phaseCompleted = tasks.filter((t) => t.status === 'completed').length;
                return (
                  <div
                    key={phase.key}
                    className={`rounded-2xl border-2 p-5 space-y-4 transition ${
                      selectedPhase === phase.key ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`w-3 h-3 rounded-full ${phase.color}`} />
                        <div>
                          <h3 className="font-semibold text-slate-800">{phase.label}</h3>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {phaseCompleted}/{tasks.length} 完成
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 max-h-[700px] overflow-y-auto pr-1">
                      {tasks.length === 0 && (
                        <div className="py-10 text-center text-slate-400 text-sm">
                          暂无{phaseLabel(phase.key)}任务
                        </div>
                      )}
                      {tasks.map((task) => {
                        const risks = riskFlagsByTask[task.id] || [];
                        const isExpanded = expandedTaskId === task.id;
                        return (
                          <div
                            key={task.id}
                            className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition"
                          >
                            <TaskCard
                              task={task}
                              exhibitPlacement={currentExhibition.exhibits.find(
                                (e) => e.placement_task_id === task.id
                              )}
                              readOnly={isReadOnly}
                              allTasks={currentExhibition.tasks}
                              onProgressUpdate={async (status, progress) =>
                                updateTaskProgress(task.id, {
                                  status,
                                  progress,
                                  updated_by: 'worker',
                                })
                              }
                              onDelete={() => deleteTask(task.id)}
                            />

                            <button
                              onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                              className="w-full px-4 py-2 flex items-center justify-between text-xs text-slate-500 border-t border-slate-100 bg-slate-50 hover:bg-slate-100 transition"
                            >
                              <span className="flex items-center gap-4">
                                {risks.slice(0, 3).map((r, i) => (
                                  <span
                                    key={i}
                                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                      r.type === 'danger'
                                        ? 'bg-red-100 text-red-700'
                                        : r.type === 'warn'
                                        ? 'bg-amber-100 text-amber-700'
                                        : 'bg-slate-100 text-slate-700'
                                    }`}
                                  >
                                    {r.label}
                                  </span>
                                ))}
                                {risks.length > 3 && (
                                  <span className="text-slate-400">+{risks.length - 3}</span>
                                )}
                              </span>
                              <span className="flex items-center gap-1">
                                四要素详情
                                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </span>
                            </button>

                            {isExpanded && (
                              <div className="p-4 border-t border-slate-100 space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="p-3 bg-slate-50 rounded-lg">
                                    <div className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1">
                                      <Link2 className="w-3 h-3" /> 任务依赖
                                    </div>
                                    <div className="space-y-1">
                                      {(task.dependencies || []).length === 0 && (
                                        <div className="text-xs text-slate-400">无依赖</div>
                                      )}
                                      {(task.dependencies || []).map((depId) => {
                                        const dep = currentExhibition.tasks.find((d) => d.id === depId);
                                        return (
                                          <div key={depId} className="flex items-center justify-between text-xs">
                                            <span className="text-slate-700">
                                              {dep?.name || depId.substring(0, 14)}
                                            </span>
                                            <div className="flex items-center gap-2">
                                              <span className={phaseColor(dep?.phase as TaskPhase)}>
                                                {dep ? statusLabel(dep.status) : ''}
                                              </span>
                                              {!isReadOnly && (
                                                <button
                                                  onClick={() => removeDependency(task.id, depId)}
                                                  className="text-red-400 hover:text-red-600"
                                                >
                                                  <X className="w-3 h-3" />
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                      {!isReadOnly && (
                                        <button
                                          onClick={() => setDepModalTaskId(task.id)}
                                          className="mt-1 text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                                        >
                                          <Plus className="w-3 h-3" /> 添加依赖
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  <div className="p-3 bg-slate-50 rounded-lg">
                                    <div className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1">
                                      <Droplets className="w-3 h-3" /> 展品条件
                                    </div>
                                    <div className="space-y-1 text-xs">
                                      <div className="flex items-center justify-between">
                                        <span className="text-slate-500 flex items-center gap-1">
                                          <Truck className="w-3 h-3" /> 运输窗口
                                        </span>
                                        <span className="text-slate-700">
                                          {task.transport_window_start && task.transport_window_end
                                            ? `${task.transport_window_start.substring(0, 10)}~${task.transport_window_end.substring(0, 10)}`
                                            : '未设置'}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <span className="text-slate-500 flex items-center gap-1">
                                          <Shield className="w-3 h-3" /> 保险状态
                                        </span>
                                        <span
                                          className={`px-2 py-0.5 rounded-full font-medium ${insuranceColor(task.insurance_status as InsuranceStatus)}`}
                                        >
                                          {insuranceStatusLabel(task.insurance_status as InsuranceStatus)}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <span className="text-slate-500 flex items-center gap-1">
                                          <Lightbulb className="w-3 h-3" /> 灯光校验
                                        </span>
                                        <span
                                          className={`px-2 py-0.5 rounded-full font-medium ${lightingColor(task.lighting_check as LightingCheckStatus)}`}
                                        >
                                          {lightingCheckLabel(task.lighting_check as LightingCheckStatus)}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="p-3 bg-slate-50 rounded-lg">
                                    <div className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1">
                                      <AlertTriangle className="w-3 h-3" /> 施工风险
                                    </div>
                                    <div className="space-y-1">
                                      {risks.length === 0 && (
                                        <div className="text-xs text-emerald-600">无风险，可正常施工</div>
                                      )}
                                      {risks.map((r, i) => (
                                        <div
                                          key={i}
                                          className={`text-xs px-2 py-1 rounded ${
                                            r.type === 'danger'
                                              ? 'bg-red-100 text-red-700'
                                              : r.type === 'warn'
                                              ? 'bg-amber-100 text-amber-700'
                                              : 'bg-slate-100 text-slate-700'
                                          }`}
                                        >
                                          {r.label}
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="p-3 bg-slate-50 rounded-lg">
                                    <div className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1">
                                      <Clock className="w-3 h-3" /> 状态切换时间线
                                    </div>
                                    <div className="space-y-1 text-xs">
                                      <div className="flex items-center justify-between">
                                        <span className="text-slate-500">当前状态</span>
                                        <span className="font-medium">{statusLabel(task.status)}</span>
                                      </div>
                                      {task.earliest_start && (
                                        <div className="flex items-center justify-between">
                                          <span className="text-slate-500">最早可施工</span>
                                          <span className="text-slate-700">
                                            {new Date(task.earliest_start).toLocaleString('zh-CN', {
                                              month: '2-digit',
                                              day: '2-digit',
                                              hour: '2-digit',
                                              minute: '2-digit',
                                            })}
                                          </span>
                                        </div>
                                      )}
                                      {task.hoisting_order !== null && (
                                        <div className="flex items-center justify-between">
                                          <span className="text-slate-500">吊装顺序</span>
                                          <span className="text-amber-700 font-mono">#{task.hoisting_order}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div>
                                  <div className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1">
                                    <History className="w-3 h-3" /> 审计日志 · 改期/复核/封闭记录
                                  </div>
                                  <AuditLogList
                                    logs={(currentExhibition as unknown as { audit_logs?: TaskAuditLog[] }).audit_logs?.filter(
                                      (l) => l.task_id === task.id
                                    ) || []}
                                  />
                                </div>

                                {!isReadOnly && (
                                  <div className="flex gap-2 pt-2 border-t border-slate-100">
                                    <select
                                      value={task.phase}
                                      onChange={(e) =>
                                        updateTask(task.id, {
                                          phase: e.target.value as TaskPhase,
                                          changed_by: 'curator',
                                        })
                                      }
                                      className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                    >
                                      {PHASES.map((p) => (
                                        <option key={p.key} value={p.key}>
                                          阶段：{p.label}
                                        </option>
                                      ))}
                                    </select>
                                    <select
                                      value={task.insurance_status}
                                      onChange={(e) =>
                                        updateTask(task.id, {
                                          insurance_status: e.target.value as InsuranceStatus,
                                          changed_by: 'curator',
                                        })
                                      }
                                      className="px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                    >
                                      <option value="not_set">保险：未设置</option>
                                      <option value="pending">保险：办理中</option>
                                      <option value="covered">保险：已覆盖</option>
                                      <option value="not_required">保险：不适用</option>
                                    </select>
                                    <select
                                      value={task.lighting_check}
                                      onChange={(e) =>
                                        updateTask(task.id, {
                                          lighting_check: e.target.value as LightingCheckStatus,
                                          changed_by: 'curator',
                                        })
                                      }
                                      className="px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                    >
                                      <option value="not_required">灯光：不适用</option>
                                      <option value="pending">灯光：待校验</option>
                                      <option value="passed">灯光：已通过</option>
                                      <option value="failed">灯光：不达标</option>
                                    </select>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'exhibits' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">展品清单</h2>
              {!isReadOnly && (
                <button
                  onClick={() => setShowExhibitModal(true)}
                  className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition flex items-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  添加展品
                </button>
              )}
            </div>
            <ExhibitList
              exhibits={currentExhibition.exhibits}
              tasks={currentExhibition.tasks}
              readOnly={isReadOnly}
              onConfirmThermostat={(eid, confirmedBy) => confirmThermostat(eid, confirmedBy)}
              onConfirmRestoration={(eid, confirmedBy, reason) =>
                confirmRestoration(eid, confirmedBy, reason)
              }
              onDelete={(eid) => deleteExhibit(eid)}
            />
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-slate-800">展区全量变更日志</h2>
            <AuditLogList
              logs={(currentExhibition as unknown as { audit_logs?: TaskAuditLog[] }).audit_logs || []}
              expanded
            />
          </div>
        )}
      </div>

      {showTaskModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 sticky top-0 bg-white">
              <h3 className="text-xl font-bold text-slate-900">创建展区任务</h3>
              <p className="text-sm text-slate-500 mt-0.5">策展人请完整填写运输、保险、灯光条件</p>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">任务标题 *</label>
                <input
                  type="text"
                  value={taskForm.name}
                  onChange={(e) => setTaskForm({ ...taskForm, name: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                  placeholder="展墙A - 主视觉布展"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">优先级</label>
                  <select
                    value={taskForm.priority}
                    onChange={(e) =>
                      setTaskForm({ ...taskForm, priority: e.target.value as CreateTaskRequest['priority'] })
                    }
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  >
                    <option value="low">低</option>
                    <option value="medium">中</option>
                    <option value="high">高</option>
                    <option value="critical">紧急</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">负责角色</label>
                  <select
                    value={taskForm.assignee_role}
                    onChange={(e) =>
                      setTaskForm({ ...taskForm, assignee_role: e.target.value as CreateTaskRequest['assignee_role'] })
                    }
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  >
                    <option value="curator">策展人</option>
                    <option value="worker">施工队</option>
                    <option value="director">馆长</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">阶段</label>
                  <select
                    value={taskForm.phase}
                    onChange={(e) =>
                      setTaskForm({ ...taskForm, phase: e.target.value as TaskPhase })
                    }
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  >
                    {PHASES.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">任务类别</label>
                  <select
                    value={taskForm.category}
                    onChange={(e) =>
                      setTaskForm({ ...taskForm, category: e.target.value as never })
                    }
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  >
                    <option value="wall_install">展墙安装</option>
                    <option value="installation">装置吊装</option>
                    <option value="framing">装裱</option>
                    <option value="lighting">灯光调试</option>
                    <option value="exhibit_placement">展品布置</option>
                    <option value="condition_check">状态复核</option>
                    <option value="label_printing">标签打印</option>
                    <option value="cleaning">清场清洁</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1">
                    <Truck className="w-4 h-4" /> 作品运输窗口（开始）
                  </label>
                  <input
                    type="datetime-local"
                    value={taskForm.transport_window_start}
                    onChange={(e) =>
                      setTaskForm({ ...taskForm, transport_window_start: e.target.value })
                    }
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1">
                    <Truck className="w-4 h-4" /> 作品运输窗口（结束）
                  </label>
                  <input
                    type="datetime-local"
                    value={taskForm.transport_window_end}
                    onChange={(e) => setTaskForm({ ...taskForm, transport_window_end: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1">
                    <Shield className="w-4 h-4" /> 保险状态
                  </label>
                  <select
                    value={taskForm.insurance_status}
                    onChange={(e) =>
                      setTaskForm({ ...taskForm, insurance_status: e.target.value as InsuranceStatus })
                    }
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  >
                    <option value="not_set">未设置</option>
                    <option value="pending">办理中</option>
                    <option value="covered">已覆盖</option>
                    <option value="not_required">不适用</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1">
                    <Lightbulb className="w-4 h-4" /> 灯光校验
                  </label>
                  <select
                    value={taskForm.lighting_check}
                    onChange={(e) =>
                      setTaskForm({ ...taskForm, lighting_check: e.target.value as LightingCheckStatus })
                    }
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  >
                    <option value="not_required">不适用</option>
                    <option value="pending">待校验</option>
                    <option value="passed">已通过</option>
                    <option value="failed">不达标</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1">
                    <Layers className="w-4 h-4" /> 吊装顺序号
                  </label>
                  <input
                    type="number"
                    value={taskForm.hoisting_order}
                    onChange={(e) => setTaskForm({ ...taskForm, hoisting_order: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    placeholder="1, 2, 3..."
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">指派施工队</label>
                  <input
                    type="text"
                    value={taskForm.assigned_to}
                    onChange={(e) => setTaskForm({ ...taskForm, assigned_to: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    placeholder="A组-张工队"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">截止日期</label>
                  <input
                    type="datetime-local"
                    value={taskForm.due_date}
                    onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">预估工时（小时）</label>
                <input
                  type="number"
                  value={taskForm.estimated_hours}
                  onChange={(e) =>
                    setTaskForm({ ...taskForm, estimated_hours: parseInt(e.target.value) || 0 })
                  }
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">说明</label>
                <textarea
                  value={taskForm.description}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">前置依赖（多选）</label>
                <div className="max-h-32 overflow-y-auto border border-slate-200 rounded-xl p-2 space-y-1">
                  {currentExhibition.tasks.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 rounded text-sm">
                      <input
                        type="checkbox"
                        checked={taskForm.dependencies.includes(t.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setTaskForm({ ...taskForm, dependencies: [...taskForm.dependencies, t.id] });
                          } else {
                            setTaskForm({
                              ...taskForm,
                              dependencies: taskForm.dependencies.filter((d) => d !== t.id),
                            });
                          }
                        }}
                        className="rounded text-indigo-600"
                      />
                      <span className="text-slate-700">{t.name}</span>
                      <span className="text-xs text-slate-400 ml-auto">{statusLabel(t.status)}</span>
                    </label>
                  ))}
                  {currentExhibition.tasks.length === 0 && (
                    <div className="text-xs text-slate-400 p-2 text-center">暂无其他任务可选</div>
                  )}
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-slate-200 flex gap-3 sticky bottom-0 bg-white">
              <button
                onClick={() => setShowTaskModal(false)}
                className="flex-1 px-4 py-2.5 border border-slate-300 rounded-xl font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                取消
              </button>
              <button
                onClick={handleCreateTask}
                className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition shadow-lg shadow-indigo-200"
              >
                创建任务
              </button>
            </div>
          </div>
        </div>
      )}

      {showExhibitModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-xl font-bold text-slate-900">添加展品</h3>
              <p className="text-sm text-slate-500 mt-0.5">重点展品需完成修复与恒温确认才能开幕</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">作品名称 *</label>
                <input
                  type="text"
                  value={exhibitForm.name}
                  onChange={(e) => setExhibitForm({ ...exhibitForm, name: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">艺术家</label>
                  <input
                    type="text"
                    value={exhibitForm.artist}
                    onChange={(e) => setExhibitForm({ ...exhibitForm, artist: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">创作年份</label>
                  <input
                    type="number"
                    value={exhibitForm.year}
                    onChange={(e) => setExhibitForm({ ...exhibitForm, year: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">展陈位置</label>
                <input
                  type="text"
                  value={exhibitForm.position}
                  onChange={(e) => setExhibitForm({ ...exhibitForm, position: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="北墙A3展位"
                />
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exhibitForm.is_key_exhibit}
                    onChange={(e) =>
                      setExhibitForm({ ...exhibitForm, is_key_exhibit: e.target.checked })
                    }
                    className="rounded text-indigo-600 w-4 h-4"
                  />
                  重点展品（开幕前需完成修复确认）
                </label>
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exhibitForm.needs_thermostat}
                    onChange={(e) =>
                      setExhibitForm({ ...exhibitForm, needs_thermostat: e.target.checked })
                    }
                    className="rounded text-indigo-600 w-4 h-4"
                  />
                  需恒温柜（开幕前需完成恒温确认）
                </label>
              </div>
            </div>
            <div className="p-6 border-t border-slate-200 flex gap-3">
              <button
                onClick={() => setShowExhibitModal(false)}
                className="flex-1 px-4 py-2.5 border border-slate-300 rounded-xl font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                取消
              </button>
              <button
                onClick={handleCreateExhibit}
                className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition"
              >
                添加展品
              </button>
            </div>
          </div>
        </div>
      )}

      {showAnomalyModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
            <div className="p-6 border-b border-red-200 bg-red-50 rounded-t-2xl">
              <h3 className="text-xl font-bold text-red-700 flex items-center gap-2">
                <AlertOctagon className="w-5 h-5" /> 触发温湿度异常
              </h3>
              <p className="text-sm text-red-600 mt-0.5">
                触发后展区将切至只读模式，但撤展计划和责任人数据将被保留
              </p>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">异常原因 *</label>
              <textarea
                value={anomalyReason}
                onChange={(e) => setAnomalyReason(e.target.value)}
                rows={3}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 resize-none"
                placeholder="例：恒温柜湿度传感器读数超过 65% RH，持续 15 分钟"
              />
            </div>
            <div className="p-6 border-t border-slate-200 flex gap-3">
              <button
                onClick={() => setShowAnomalyModal(false)}
                className="flex-1 px-4 py-2.5 border border-slate-300 rounded-xl font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                取消
              </button>
              <button
                onClick={handleTriggerAnomaly}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition"
              >
                确认触发异常
              </button>
            </div>
          </div>
        </div>
      )}

      {showTeardownModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Hammer className="w-5 h-5 text-rose-600" /> 设置撤展责任人
              </h3>
              <p className="text-sm text-slate-500 mt-0.5">
                设置后，系统会将展品布置类任务自动切换为撤展阶段
              </p>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">责任人姓名 *</label>
              <input
                type="text"
                value={teardownPerson}
                onChange={(e) => setTeardownPerson(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-400"
                placeholder="撤展组李队长"
              />
            </div>
            <div className="p-6 border-t border-slate-200 flex gap-3">
              <button
                onClick={() => setShowTeardownModal(false)}
                className="flex-1 px-4 py-2.5 border border-slate-300 rounded-xl font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                取消
              </button>
              <button
                onClick={handleSetTeardown}
                className="flex-1 px-4 py-2.5 bg-rose-600 text-white rounded-xl font-medium hover:bg-rose-700 transition"
              >
                确认设置
              </button>
            </div>
          </div>
        </div>
      )}

      {depModalTaskId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-xl font-bold text-slate-900">添加任务依赖</h3>
              <p className="text-sm text-slate-500 mt-0.5">选择必须在此任务之前完成的前置任务</p>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">前置任务</label>
              <select
                value={depTargetId}
                onChange={(e) => setDepTargetId(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <option value="">请选择...</option>
                {currentExhibition.tasks
                  .filter((t) => t.id !== depModalTaskId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} ({statusLabel(t.status)})
                    </option>
                  ))}
              </select>
            </div>
            <div className="p-6 border-t border-slate-200 flex gap-3">
              <button
                onClick={() => {
                  setDepModalTaskId(null);
                  setDepTargetId('');
                }}
                className="flex-1 px-4 py-2.5 border border-slate-300 rounded-xl font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                取消
              </button>
              <button
                onClick={handleAddDep}
                className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition"
              >
                添加依赖
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="fixed bottom-6 right-6 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 z-50">
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          处理中...
        </div>
      )}
    </div>
  );
}
