import { useAppStore } from '../store/appStore.js';
import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState, useMemo } from 'react';
import {
  ArrowLeft,
  Plus,
  Lock,
  Edit3,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle2,
  XCircle,
  Link,
  Unlink,
  Thermometer,
  AlertTriangle,
  Award,
  Wrench,
  Calendar,
  Lightbulb,
  LayoutGrid,
  ClipboardCheck,
  Flag,
  Sparkles,
} from 'lucide-react';
import type {
  TaskCategory,
  TaskStatus,
  UserRole,
  Task,
  Exhibit,
  ProgressUpdate,
} from '../../shared/types.js';
import { cn } from '../lib/utils.js';

type TaskWithDetails = Task & {
  dependencies: string[];
  dependents: string[];
  progress_updates: ProgressUpdate[];
};

const CATEGORY_CONFIG: Record<
  TaskCategory,
  { label: string; icon: typeof Plus; color: string; bg: string }
> = {
  planning: { label: '策展规划', icon: Edit3, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-100 dark:bg-indigo-900/40' },
  design: { label: '空间设计', icon: Lightbulb, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-100 dark:bg-violet-900/40' },
  construction: { label: '展区搭建', icon: Wrench, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/40' },
  installation: { label: '展墙吊装', icon: LayoutGrid, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/40' },
  lighting: { label: '灯光调试', icon: Sparkles, color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-100 dark:bg-yellow-900/40' },
  exhibit_placement: { label: '展品布置', icon: Award, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/40' },
  quality_check: { label: '质量检查', icon: ClipboardCheck, color: 'text-cyan-600 dark:text-cyan-400', bg: 'bg-cyan-100 dark:bg-cyan-900/40' },
  opening_preparation: { label: '开幕准备', icon: Flag, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-100 dark:bg-rose-900/40' },
};

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bg: string }> = {
  pending: { label: '待开始', color: 'text-stone-600 dark:text-stone-300', bg: 'bg-stone-100 dark:bg-stone-800' },
  in_progress: { label: '进行中', color: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-100 dark:bg-sky-900/40' },
  completed: { label: '已完成', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/40' },
  blocked: { label: '阻塞中', color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-100 dark:bg-rose-900/40' },
};

const ROLE_LABEL: Record<UserRole, string> = {
  curator: '策展人',
  worker: '施工队',
  director: '馆长',
};

const EXHIBIT_STATUS_LABEL: Record<string, string> = {
  not_arrived: '未到货',
  in_storage: '入库存储',
  placed: '已布置',
  in_position: '就位完成',
};

export default function ExhibitionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    currentUser,
    currentExhibition,
    loadExhibition,
    loading,
    toasts,
    createTask,
    updateTaskProgress,
    addTaskDependency,
    removeTaskDependency,
    createExhibit,
    updateExhibit,
    confirmThermostat,
    confirmOpening,
    updateExhibition,
  } = useAppStore();

  const [tab, setTab] = useState<'overview' | 'tasks' | 'exhibits'>('overview');
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showExhibitModal, setShowExhibitModal] = useState(false);
  const [showDepModal, setShowDepModal] = useState<string | null>(null);
  const [showProgressModal, setShowProgressModal] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // Task form
  const [taskName, setTaskName] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskCategory, setTaskCategory] = useState<TaskCategory>('planning');
  const [taskRole, setTaskRole] = useState<UserRole>('curator');
  const [taskDue, setTaskDue] = useState('');
  const [taskDeps, setTaskDeps] = useState<string[]>([]);

  // Exhibit form
  const [exhibitName, setExhibitName] = useState('');
  const [exhibitArtist, setExhibitArtist] = useState('');
  const [exhibitYear, setExhibitYear] = useState('');
  const [isKeyExhibit, setIsKeyExhibit] = useState(false);
  const [needsThermo, setNeedsThermo] = useState(false);
  const [exhibitStatus, setExhibitStatus] = useState<Exhibit['status']>('not_arrived');
  const [exhibitPosition, setExhibitPosition] = useState('');

  // Progress form
  const [progressVal, setProgressVal] = useState(0);
  const [progressStatus, setProgressStatus] = useState<TaskStatus>('in_progress');
  const [progressComment, setProgressComment] = useState('');

  // Edit exh form
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');

  useEffect(() => {
    if (!currentUser) {
      navigate('/');
      return;
    }
    if (id) loadExhibition(id);
  }, [id, currentUser, navigate, loadExhibition]);

  const exh = currentExhibition;
  const isReadOnly = !!exh?.read_only;

  const tasksByCategory = useMemo(() => {
    const groups: Partial<Record<TaskCategory, TaskWithDetails[]>> = {};
    if (!exh) return groups;
    for (const t of exh.tasks) {
      if (!groups[t.category]) groups[t.category] = [];
      groups[t.category]!.push(t);
    }
    return groups;
  }, [exh]);

  const overallProgress = useMemo(() => {
    if (!exh || exh.tasks.length === 0) return 0;
    const sum = exh.tasks.reduce((s, t) => s + t.progress, 0);
    return Math.round(sum / exh.tasks.length);
  }, [exh]);

  const allTasksCompleted = useMemo(() => {
    if (!exh || exh.tasks.length === 0) return false;
    return exh.tasks.every((t) => t.status === 'completed');
  }, [exh]);

  const keyExhibitsReady = useMemo(() => {
    if (!exh) return true;
    const keyExhibits = exh.exhibits.filter((e) => e.is_key_exhibit && e.needs_thermostat);
    if (keyExhibits.length === 0) return true;
    return keyExhibits.every((e) => e.thermostat_confirmed);
  }, [exh]);

  const keyExhibitsPending = useMemo(() => {
    if (!exh) return 0;
    return exh.exhibits.filter((e) => e.is_key_exhibit && e.needs_thermostat && !e.thermostat_confirmed).length;
  }, [exh]);

  const canConfirmOpening = useMemo(() => {
    if (!exh || exh.read_only) return false;
    if (currentUser?.role !== 'director') return false;
    const install = exh.tasks.find((t) => t.category === 'installation');
    if (install && install.status !== 'completed') return false;
    return keyExhibitsReady;
  }, [exh, currentUser, keyExhibitsReady]);

  const openEditModal = () => {
    if (!exh) return;
    setEditName(exh.name);
    setEditDesc(exh.description);
    setEditStart(exh.start_date ? exh.start_date.split('T')[0] : '');
    setEditEnd(exh.end_date ? exh.end_date.split('T')[0] : '');
    setShowEditModal(true);
  };

  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exh) return;
    try {
      await updateExhibition(exh.id, {
        name: editName,
        description: editDesc,
        start_date: editStart || null,
        end_date: editEnd || null,
      });
      setShowEditModal(false);
    } catch {
      // handled
    }
  };

  const handleSubmitTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exh || !currentUser || !taskName) return;
    try {
      await createTask({
        exhibition_id: exh.id,
        name: taskName,
        description: taskDesc,
        category: taskCategory,
        assignee_role: taskRole,
        due_date: taskDue || undefined,
        created_by: currentUser.id,
        dependencies: taskDeps,
      });
      resetTaskForm();
      setShowTaskModal(false);
    } catch {
      // handled
    }
  };

  const resetTaskForm = () => {
    setTaskName('');
    setTaskDesc('');
    setTaskCategory('planning');
    setTaskRole('curator');
    setTaskDue('');
    setTaskDeps([]);
  };

  const handleSubmitExhibit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exh || !exhibitName) return;
    try {
      await createExhibit({
        exhibition_id: exh.id,
        name: exhibitName,
        artist: exhibitArtist || null,
        year: exhibitYear || null,
        is_key_exhibit: isKeyExhibit,
        needs_thermostat: needsThermo || isKeyExhibit,
        status: exhibitStatus,
        position: exhibitPosition || null,
      });
      resetExhibitForm();
      setShowExhibitModal(false);
    } catch {
      // handled
    }
  };

  const resetExhibitForm = () => {
    setExhibitName('');
    setExhibitArtist('');
    setExhibitYear('');
    setIsKeyExhibit(false);
    setNeedsThermo(false);
    setExhibitStatus('not_arrived');
    setExhibitPosition('');
  };

  const openProgressModal = (task: TaskWithDetails) => {
    setProgressVal(task.progress);
    setProgressStatus(task.status);
    setProgressComment('');
    setShowProgressModal(task.id);
  };

  const handleSubmitProgress = async () => {
    if (!showProgressModal || !currentUser) return;
    try {
      await updateTaskProgress(showProgressModal, {
        progress: progressVal,
        status: progressStatus,
        comment: progressComment || undefined,
        updated_by: currentUser.id,
      });
      setShowProgressModal(null);
    } catch {
      // handled
    }
  };

  const isTaskBlocked = (task: TaskWithDetails) => {
    if (!exh) return false;
    if (task.category !== 'installation') return false;
    return task.dependencies.some((depId) => {
      const dep = exh.tasks.find((t) => t.id === depId);
      return dep && dep.status !== 'completed';
    });
  };

  if (!exh) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-3 border-amber-500 border-t-transparent rounded-full mx-auto mb-3"></div>
          <p className="text-stone-500 dark:text-stone-400">{loading ? '加载中...' : '展区不存在'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-4">
              <button
                onClick={() => navigate('/dashboard')}
                className="p-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl font-bold text-stone-800 dark:text-stone-100">{exh.name}</h1>
                  {exh.read_only && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 text-xs font-semibold">
                      <Lock className="w-3 h-3" />
                      已开幕 · 只读
                    </span>
                  )}
                  {!exh.read_only && exh.opening_confirmed && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
                      <CheckCircle2 className="w-3 h-3" />
                      已确认开幕
                    </span>
                  )}
                </div>
                {exh.description && (
                  <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">{exh.description}</p>
                )}
                {(exh.start_date || exh.end_date) && (
                  <div className="flex items-center gap-1 text-xs text-stone-500 dark:text-stone-400 mt-1.5">
                    <Calendar className="w-3 h-3" />
                    {exh.start_date && exh.start_date.split('T')[0]}
                    {exh.start_date && exh.end_date && ' ~ '}
                    {exh.end_date && exh.end_date.split('T')[0]}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {!isReadOnly && currentUser?.role === 'curator' && (
                <button
                  onClick={openEditModal}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 text-sm font-medium hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
                >
                  <Edit3 className="w-4 h-4" />
                  编辑展区
                </button>
              )}
              {!isReadOnly && currentUser?.role === 'director' && (
                <button
                  onClick={() => exh && confirmOpening(exh.id, currentUser.id)}
                  disabled={!canConfirmOpening}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all',
                    canConfirmOpening
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:shadow-lg'
                      : 'bg-stone-200 dark:bg-stone-800 text-stone-400 cursor-not-allowed'
                  )}
                  title={
                    !canConfirmOpening
                      ? currentUser?.role !== 'director'
                        ? '仅馆长可确认开幕'
                        : '吊装未完成或重点展品恒温柜未全部确认'
                      : ''
                  }
                >
                  <CheckCircle2 className="w-4 h-4" />
                  确认开幕
                </button>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-stone-600 dark:text-stone-300">
                整体进度: {overallProgress}%
              </span>
              <span className="text-xs text-stone-500 dark:text-stone-400">
                {exh.tasks.filter((t) => t.status === 'completed').length} / {exh.tasks.length} 项已完成
              </span>
            </div>
            <div className="h-2.5 bg-stone-200 dark:bg-stone-800 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  overallProgress === 100
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                    : 'bg-gradient-to-r from-amber-500 to-rose-500'
                )}
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          </div>

          {/* Opening Pre-check */}
          {!isReadOnly && currentUser?.role === 'director' && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div
                className={cn(
                  'rounded-xl p-3 border flex items-center gap-3',
                  allTasksCompleted || exh.tasks.length === 0
                    ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/40'
                    : 'border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/40'
                )}
              >
                {(allTasksCompleted || exh.tasks.length === 0 ? <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" /> : <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />)}
                <div className="text-sm">
                  <div className="font-medium text-stone-800 dark:text-stone-100">任务完成</div>
                  <div className="text-xs text-stone-500 dark:text-stone-400">
                    {allTasksCompleted || exh.tasks.length === 0 ? '所有任务已完成' : `尚有未完成任务`}
                  </div>
                </div>
              </div>
              <div
                className={cn(
                  'rounded-xl p-3 border flex items-center gap-3',
                  (() => {
                    const install = exh.tasks.find((t) => t.category === 'installation');
                    return !install || install.status === 'completed';
                  })()
                    ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/40'
                    : 'border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/40'
                )}
              >
                {(() => {
                  const install = exh.tasks.find((t) => t.category === 'installation');
                  const ok = !install || install.status === 'completed';
                  return ok ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                  );
                })()}
                <div className="text-sm">
                  <div className="font-medium text-stone-800 dark:text-stone-100">展墙吊装</div>
                  <div className="text-xs text-stone-500 dark:text-stone-400">
                    {(() => {
                      const install = exh.tasks.find((t) => t.category === 'installation');
                      return !install || install.status === 'completed' ? '吊装已完成' : '吊装任务未完成';
                    })()}
                  </div>
                </div>
              </div>
              <div
                className={cn(
                  'rounded-xl p-3 border flex items-center gap-3',
                  keyExhibitsReady
                    ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/40'
                    : 'border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/40'
                )}
              >
                {keyExhibitsReady ? (
                  <Thermometer className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                )}
                <div className="text-sm">
                  <div className="font-medium text-stone-800 dark:text-stone-100">重点展品恒温柜</div>
                  <div className="text-xs text-stone-500 dark:text-stone-400">
                    {keyExhibitsReady
                      ? '所有重点展品恒温柜已确认'
                      : `${keyExhibitsPending} 件待确认`}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="mt-6 flex gap-1 border-b border-stone-200 dark:border-stone-800 -mb-px">
            {(['overview', 'tasks', 'exhibits'] as const).map((t) => {
              const labels = { overview: '总览', tasks: '任务看板', exhibits: '展品管理' };
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                    tab === t
                      ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                      : 'border-transparent text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300'
                  )}
                >
                  {labels[t]}
                  {t === 'tasks' && exh.tasks.length > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded bg-stone-100 dark:bg-stone-800">
                      {exh.tasks.length}
                    </span>
                  )}
                  {t === 'exhibits' && exh.exhibits.length > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded bg-stone-100 dark:bg-stone-800">
                      {exh.exhibits.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {tab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Task summary by category */}
              <div className="bg-white dark:bg-stone-900 rounded-xl p-5 border border-stone-200 dark:border-stone-800">
                <h3 className="font-bold text-stone-800 dark:text-stone-100 mb-4">任务进度分类</h3>
                {Object.keys(CATEGORY_CONFIG).length === 0 ||
                Object.keys(tasksByCategory).length === 0 ? (
                  <p className="text-sm text-stone-500 dark:text-stone-400 py-8 text-center">
                    暂无任务，请前往「任务看板」创建。
                  </p>
                ) : (
                  <div className="space-y-3">
                    {(Object.keys(CATEGORY_CONFIG) as TaskCategory[]).map((cat) => {
                      const cfg = CATEGORY_CONFIG[cat];
                      const tasks = tasksByCategory[cat] || [];
                      if (tasks.length === 0) return null;
                      const avg = Math.round(tasks.reduce((s, t) => s + t.progress, 0) / tasks.length);
                      const done = tasks.filter((t) => t.status === 'completed').length;
                      const Icon = cfg.icon;
                      return (
                        <div key={cat}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', cfg.bg)}>
                                <Icon className={cn('w-4 h-4', cfg.color)} />
                              </div>
                              <span className="text-sm font-medium text-stone-700 dark:text-stone-200">
                                {cfg.label}
                              </span>
                              <span className="text-xs text-stone-400">
                                {done}/{tasks.length}
                              </span>
                            </div>
                            <span className="text-sm font-semibold text-stone-700 dark:text-stone-200">{avg}%</span>
                          </div>
                          <div className="h-2 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-rose-500 transition-all"
                              style={{ width: `${avg}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Recent progress updates */}
              <div className="bg-white dark:bg-stone-900 rounded-xl p-5 border border-stone-200 dark:border-stone-800">
                <h3 className="font-bold text-stone-800 dark:text-stone-100 mb-4">最近进度更新</h3>
                {(() => {
                  const allUpdates: (ProgressUpdate & { task_name: string })[] = [];
                  for (const t of exh.tasks) {
                    for (const pu of t.progress_updates) {
                      allUpdates.push({ ...pu, task_name: t.name });
                    }
                  }
                  allUpdates.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                  const recent = allUpdates.slice(0, 10);
                  if (recent.length === 0) {
                    return (
                      <p className="text-sm text-stone-500 dark:text-stone-400 py-8 text-center">
                        暂无进度更新记录
                      </p>
                    );
                  }
                  return (
                    <div className="space-y-3">
                      {recent.map((pu) => (
                        <div
                          key={pu.id}
                          className="flex items-start gap-3 py-2 border-b border-stone-100 dark:border-stone-800 last:border-0"
                        >
                          <div className="mt-1">
                            {STATUS_CONFIG[pu.status] && (
                              <span
                                className={cn(
                                  'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
                                  STATUS_CONFIG[pu.status].bg,
                                  STATUS_CONFIG[pu.status].color
                                )}
                              >
                                {STATUS_CONFIG[pu.status].label}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-stone-800 dark:text-stone-100 truncate">
                              {pu.task_name}
                            </div>
                            {pu.comment && (
                              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">{pu.comment}</p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-sm font-bold text-stone-800 dark:text-stone-100">{pu.progress}%</div>
                            <div className="text-xs text-stone-400">
                              {new Date(pu.created_at).toLocaleString('zh-CN', { hour12: false })}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="space-y-6">
              {/* Stats */}
              <div className="bg-white dark:bg-stone-900 rounded-xl p-5 border border-stone-200 dark:border-stone-800">
                <h3 className="font-bold text-stone-800 dark:text-stone-100 mb-4">展区概览</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-stone-100 dark:border-stone-800">
                    <span className="text-sm text-stone-500 dark:text-stone-400">任务总数</span>
                    <span className="font-bold text-stone-800 dark:text-stone-100">{exh.tasks.length}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-stone-100 dark:border-stone-800">
                    <span className="text-sm text-stone-500 dark:text-stone-400">已完成</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {exh.tasks.filter((t) => t.status === 'completed').length}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-stone-100 dark:border-stone-800">
                    <span className="text-sm text-stone-500 dark:text-stone-400">进行中</span>
                    <span className="font-bold text-sky-600 dark:text-sky-400">
                      {exh.tasks.filter((t) => t.status === 'in_progress').length}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-stone-100 dark:border-stone-800">
                    <span className="text-sm text-stone-500 dark:text-stone-400">待开始</span>
                    <span className="font-bold text-stone-600 dark:text-stone-300">
                      {exh.tasks.filter((t) => t.status === 'pending').length}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-stone-500 dark:text-stone-400">展品数量</span>
                    <span className="font-bold text-stone-800 dark:text-stone-100">{exh.exhibits.length}</span>
                  </div>
                </div>
              </div>

              {/* Key exhibits */}
              <div className="bg-white dark:bg-stone-900 rounded-xl p-5 border border-stone-200 dark:border-stone-800">
                <h3 className="font-bold text-stone-800 dark:text-stone-100 mb-4">重点展品状态</h3>
                {(() => {
                  const keys = exh.exhibits.filter((e) => e.is_key_exhibit);
                  if (keys.length === 0) {
                    return (
                      <p className="text-sm text-stone-500 dark:text-stone-400 py-4 text-center">
                        暂无重点展品
                      </p>
                    );
                  }
                  return (
                    <div className="space-y-2">
                      {keys.map((e) => (
                        <div
                          key={e.id}
                          className="p-3 rounded-lg bg-stone-50 dark:bg-stone-800/50 border border-stone-100 dark:border-stone-700/50"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Award className="w-4 h-4 text-amber-500" />
                            <span className="text-sm font-semibold text-stone-800 dark:text-stone-100 truncate">
                              {e.name}
                            </span>
                          </div>
                          {e.artist && (
                            <div className="text-xs text-stone-500 dark:text-stone-400 mb-2">
                              {e.artist}
                              {e.year ? ` · ${e.year}` : ''}
                            </div>
                          )}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300">
                              {EXHIBIT_STATUS_LABEL[e.status] || e.status}
                            </span>
                            {e.needs_thermostat && (
                              e.thermostat_confirmed ? (
                                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                                  <Thermometer className="w-3 h-3" />
                                  恒温柜已确认
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300">
                                  <AlertTriangle className="w-3 h-3" />
                                  恒温柜待确认
                                </span>
                              )
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {tab === 'tasks' && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100">任务看板</h2>
              {!isReadOnly && currentUser?.role === 'curator' && (
                <button
                  onClick={() => setShowTaskModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium text-sm hover:shadow-lg transition-all active:scale-[0.98]"
                >
                  <Plus className="w-4 h-4" />
                  新建任务
                </button>
              )}
            </div>

            {exh.tasks.length === 0 ? (
              <div className="bg-white dark:bg-stone-900 rounded-xl p-12 border border-stone-200 dark:border-stone-800 text-center">
                <LayoutGrid className="w-12 h-12 mx-auto mb-3 text-stone-300 dark:text-stone-700" />
                <p className="text-stone-500 dark:text-stone-400 mb-4">暂无任务</p>
                {!isReadOnly && currentUser?.role === 'curator' && (
                  <button
                    onClick={() => setShowTaskModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-white text-sm hover:bg-amber-600 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    创建任务
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {(Object.keys(CATEGORY_CONFIG) as TaskCategory[]).map((cat) => {
                  const cfg = CATEGORY_CONFIG[cat];
                  const tasks = tasksByCategory[cat] || [];
                  if (tasks.length === 0) return null;
                  const Icon = cfg.icon;
                  return (
                    <div key={cat} className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
                      <div className={cn('px-4 py-3 flex items-center gap-2 border-b', cfg.bg)}>
                        <Icon className={cn('w-4 h-4', cfg.color)} />
                        <span className={cn('font-semibold text-sm', cfg.color)}>{cfg.label}</span>
                        <span className="ml-auto text-xs px-2 py-0.5 rounded bg-white/60 dark:bg-black/20 text-stone-600 dark:text-stone-300">
                          {tasks.length}
                        </span>
                      </div>
                      <div className="p-3 space-y-2">
                        {tasks.map((task) => {
                          const blocked = isTaskBlocked(task);
                          const expanded = expandedTask === task.id;
                          const canUpdate =
                            !isReadOnly &&
                            (currentUser?.role === task.assignee_role ||
                              currentUser?.role === 'curator' ||
                              currentUser?.role === 'director');
                          const sCfg = STATUS_CONFIG[task.status];
                          return (
                            <div
                              key={task.id}
                              className={cn(
                                'rounded-lg border transition-all overflow-hidden',
                                blocked
                                  ? 'border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20'
                                  : 'border-stone-200 dark:border-stone-700 hover:border-amber-300 dark:hover:border-amber-800 bg-white dark:bg-stone-900'
                              )}
                            >
                              <div
                                className="p-3 cursor-pointer"
                                onClick={() => setExpandedTask(expanded ? null : task.id)}
                              >
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <h4 className="font-semibold text-sm text-stone-800 dark:text-stone-100 leading-snug flex-1">
                                    {task.name}
                                  </h4>
                                  <span
                                    className={cn(
                                      'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium shrink-0',
                                      sCfg.bg,
                                      sCfg.color
                                    )}
                                  >
                                    {sCfg.label}
                                  </span>
                                </div>

                                {blocked && (
                                  <div className="flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400 mb-2">
                                    <AlertTriangle className="w-3 h-3" />
                                    前置任务未完成，无法吊装
                                  </div>
                                )}

                                <div className="flex items-center justify-between text-xs mb-2">
                                  <span className="text-stone-500 dark:text-stone-400">
                                    负责: {ROLE_LABEL[task.assignee_role]}
                                  </span>
                                  <span className="font-semibold text-stone-700 dark:text-stone-200">
                                    {task.progress}%
                                  </span>
                                </div>
                                <div className="h-1.5 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden mb-2">
                                  <div
                                    className={cn(
                                      'h-full rounded-full transition-all',
                                      task.progress === 100
                                        ? 'bg-emerald-500'
                                        : 'bg-gradient-to-r from-amber-400 to-rose-500'
                                    )}
                                    style={{ width: `${task.progress}%` }}
                                  />
                                </div>
                                <div className="flex items-center justify-between">
                                  {task.due_date && (
                                    <div className="flex items-center gap-1 text-xs text-stone-400">
                                      <Clock className="w-3 h-3" />
                                      {task.due_date.split('T')[0]}
                                    </div>
                                  )}
                                  {expanded ? (
                                    <ChevronUp className="w-4 h-4 text-stone-400" />
                                  ) : (
                                    <ChevronDown className="w-4 h-4 text-stone-400" />
                                  )}
                                </div>
                              </div>

                              {expanded && (
                                <div className="border-t border-stone-100 dark:border-stone-800 p-3 space-y-3 bg-stone-50 dark:bg-stone-800/50">
                                  {task.description && (
                                    <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed">
                                      {task.description}
                                    </p>
                                  )}

                                  {/* Dependencies */}
                                  {task.dependencies.length > 0 && (
                                    <div>
                                      <div className="text-xs font-semibold text-stone-500 dark:text-stone-400 mb-1.5 flex items-center gap-1">
                                        <Link className="w-3 h-3" />
                                        前置任务
                                      </div>
                                      <div className="space-y-1">
                                        {task.dependencies.map((depId) => {
                                          const dep = exh.tasks.find((t) => t.id === depId);
                                          if (!dep) return null;
                                          return (
                                            <div
                                              key={depId}
                                              className="flex items-center justify-between text-xs py-1 px-2 rounded bg-white dark:bg-stone-900"
                                            >
                                              <span className="text-stone-700 dark:text-stone-200 truncate">
                                                {dep.name}
                                              </span>
                                              <div className="flex items-center gap-2">
                                                <span
                                                  className={cn(
                                                    'px-1.5 py-0.5 rounded text-[10px]',
                                                    STATUS_CONFIG[dep.status].bg,
                                                    STATUS_CONFIG[dep.status].color
                                                  )}
                                                >
                                                  {STATUS_CONFIG[dep.status].label}
                                                </span>
                                                {!isReadOnly && currentUser?.role === 'curator' && (
                                                  <button
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      removeTaskDependency(task.id, depId);
                                                    }}
                                                    className="text-stone-400 hover:text-rose-500 transition-colors"
                                                    title="移除前置任务"
                                                  >
                                                    <Unlink className="w-3 h-3" />
                                                  </button>
                                                )}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}

                                  {/* Dependents */}
                                  {task.dependents.length > 0 && (
                                    <div>
                                      <div className="text-xs font-semibold text-stone-500 dark:text-stone-400 mb-1.5">
                                        后续任务 ↓
                                      </div>
                                      <div className="flex flex-wrap gap-1">
                                        {task.dependents.map((dId) => {
                                          const dep = exh.tasks.find((t) => t.id === dId);
                                          if (!dep) return null;
                                          return (
                                            <span
                                              key={dId}
                                              className="text-xs px-2 py-0.5 rounded bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300"
                                            >
                                              {dep.name}
                                            </span>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}

                                  {/* Progress updates */}
                                  {task.progress_updates.length > 0 && (
                                    <div>
                                      <div className="text-xs font-semibold text-stone-500 dark:text-stone-400 mb-1.5">
                                        进度记录
                                      </div>
                                      <div className="max-h-32 overflow-y-auto space-y-1">
                                        {task.progress_updates.map((pu) => (
                                          <div
                                            key={pu.id}
                                            className="flex items-center justify-between text-[11px] py-1 px-2 rounded bg-white dark:bg-stone-900"
                                          >
                                            <div className="flex items-center gap-2 min-w-0">
                                              <span
                                                className={cn(
                                                  'px-1.5 py-0.5 rounded',
                                                  STATUS_CONFIG[pu.status].bg,
                                                  STATUS_CONFIG[pu.status].color
                                                )}
                                              >
                                                {pu.progress}%
                                              </span>
                                              {pu.comment && (
                                                <span className="text-stone-500 dark:text-stone-400 truncate">
                                                  {pu.comment}
                                                </span>
                                              )}
                                            </div>
                                            <span className="text-stone-400 shrink-0 ml-2">
                                              {new Date(pu.created_at).toLocaleString('zh-CN', {
                                                month: '2-digit',
                                                day: '2-digit',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                              })}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Actions */}
                                  {!isReadOnly && (
                                    <div className="flex gap-2 pt-2">
                                      {canUpdate && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openProgressModal(task);
                                          }}
                                          className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 rounded-lg bg-sky-500 text-white text-xs font-medium hover:bg-sky-600 transition-colors"
                                        >
                                          <Edit3 className="w-3 h-3" />
                                          更新进度
                                        </button>
                                      )}
                                      {currentUser?.role === 'curator' && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setShowDepModal(task.id);
                                          }}
                                          className="inline-flex items-center justify-center gap-1 py-1.5 px-3 rounded-lg border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 text-xs font-medium hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
                                        >
                                          <Link className="w-3 h-3" />
                                          添加前置
                                        </button>
                                      )}
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
            )}
          </div>
        )}

        {tab === 'exhibits' && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100">展品管理</h2>
              {!isReadOnly && currentUser?.role === 'curator' && (
                <button
                  onClick={() => setShowExhibitModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-medium text-sm hover:shadow-lg transition-all active:scale-[0.98]"
                >
                  <Plus className="w-4 h-4" />
                  添加展品
                </button>
              )}
            </div>

            {exh.exhibits.length === 0 ? (
              <div className="bg-white dark:bg-stone-900 rounded-xl p-12 border border-stone-200 dark:border-stone-800 text-center">
                <Award className="w-12 h-12 mx-auto mb-3 text-stone-300 dark:text-stone-700" />
                <p className="text-stone-500 dark:text-stone-400 mb-4">暂无展品</p>
                {!isReadOnly && currentUser?.role === 'curator' && (
                  <button
                    onClick={() => setShowExhibitModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm hover:bg-emerald-600 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    添加展品
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {exh.exhibits.map((e) => (
                  <div
                    key={e.id}
                    className={cn(
                      'bg-white dark:bg-stone-900 rounded-xl border overflow-hidden',
                      e.is_key_exhibit
                        ? 'border-amber-300 dark:border-amber-800 shadow-md'
                        : 'border-stone-200 dark:border-stone-800'
                    )}
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {e.is_key_exhibit && <Award className="w-5 h-5 text-amber-500 shrink-0" />}
                          <h4 className="font-bold text-stone-800 dark:text-stone-100 truncate">{e.name}</h4>
                        </div>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 shrink-0">
                          {EXHIBIT_STATUS_LABEL[e.status] || e.status}
                        </span>
                      </div>

                      {(e.artist || e.year) && (
                        <div className="text-xs text-stone-500 dark:text-stone-400 mb-3">
                          {e.artist}
                          {e.artist && e.year && ' · '}
                          {e.year}
                        </div>
                      )}

                      {e.position && (
                        <div className="text-xs text-stone-500 dark:text-stone-400 mb-3">
                          <span className="px-1.5 py-0.5 bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 rounded mr-1.5">
                            位置
                          </span>
                          {e.position}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {e.is_key_exhibit && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-medium">
                            重点展品
                          </span>
                        )}
                        {e.needs_thermostat &&
                          (e.thermostat_confirmed ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-medium">
                              <Thermometer className="w-3 h-3" />
                              恒温柜已确认
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 font-medium">
                              <AlertTriangle className="w-3 h-3" />
                              恒温柜待确认
                            </span>
                          ))}
                      </div>

                      {e.thermostat_confirmed_at && (
                        <div className="text-xs text-stone-400 mb-3">
                          恒温柜确认于 {new Date(e.thermostat_confirmed_at).toLocaleString('zh-CN')}
                        </div>
                      )}

                      {!isReadOnly && (
                        <div className="flex gap-2 pt-2 border-t border-stone-100 dark:border-stone-800">
                          {currentUser?.role === 'curator' && (
                            <button
                              onClick={() => {
                                const newStatus = (
                                  ['not_arrived', 'in_storage', 'placed', 'in_position'] as const
                                )[
                                  Math.min(
                                    ['not_arrived', 'in_storage', 'placed', 'in_position'].indexOf(e.status) + 1,
                                    3
                                  )
                                ];
                                updateExhibit(e.id, { status: newStatus });
                              }}
                              disabled={e.status === 'in_position'}
                              className={cn(
                                'flex-1 inline-flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-colors',
                                e.status === 'in_position'
                                  ? 'bg-stone-100 dark:bg-stone-800 text-stone-400 cursor-not-allowed'
                                  : 'bg-sky-500 text-white hover:bg-sky-600'
                              )}
                            >
                              推进状态
                            </button>
                          )}
                          {e.needs_thermostat &&
                            !e.thermostat_confirmed &&
                            (currentUser?.role === 'curator' || currentUser?.role === 'director') && (
                              <button
                                onClick={() => currentUser && confirmThermostat(e.id, currentUser.id)}
                                className="inline-flex items-center justify-center gap-1 py-1.5 px-3 rounded-lg bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 transition-colors"
                              >
                                <Thermometer className="w-3 h-3" />
                                确认恒温
                              </button>
                            )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ============ MODALS ============ */}

      {/* Edit Exhibition Modal */}
      {showEditModal && (
        <Modal title="编辑展区" onClose={() => setShowEditModal(false)}>
          <form onSubmit={handleSubmitEdit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                展区名称 *
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                展区描述
              </label>
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={3}
                className={cn(inputCls, 'resize-none')}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                  开展日期
                </label>
                <input type="date" value={editStart} onChange={(e) => setEditStart(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                  结束日期
                </label>
                <input type="date" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} className={inputCls} />
              </div>
            </div>
            <ModalFooter
              onCancel={() => setShowEditModal(false)}
              onSubmitText="保存修改"
              disabled={!editName}
            />
          </form>
        </Modal>
      )}

      {/* New Task Modal */}
      {showTaskModal && (
        <Modal title="新建任务" onClose={() => setShowTaskModal(false)}>
          <form onSubmit={handleSubmitTask} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                任务名称 *
              </label>
              <input
                type="text"
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                任务描述
              </label>
              <textarea
                value={taskDesc}
                onChange={(e) => setTaskDesc(e.target.value)}
                rows={2}
                className={cn(inputCls, 'resize-none')}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                  任务分类 *
                </label>
                <select
                  value={taskCategory}
                  onChange={(e) => setTaskCategory(e.target.value as TaskCategory)}
                  className={inputCls}
                >
                  {(Object.keys(CATEGORY_CONFIG) as TaskCategory[]).map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_CONFIG[c].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                  负责角色 *
                </label>
                <select
                  value={taskRole}
                  onChange={(e) => setTaskRole(e.target.value as UserRole)}
                  className={inputCls}
                >
                  <option value="curator">{ROLE_LABEL.curator}</option>
                  <option value="worker">{ROLE_LABEL.worker}</option>
                  <option value="director">{ROLE_LABEL.director}</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                截止日期
              </label>
              <input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                前置任务（可多选）
              </label>
              <div className="max-h-40 overflow-y-auto border border-stone-200 dark:border-stone-700 rounded-lg divide-y divide-stone-100 dark:divide-stone-800">
                {exh.tasks.length === 0 ? (
                  <div className="p-3 text-sm text-stone-400 text-center">暂无可选任务</div>
                ) : (
                  exh.tasks.map((t) => (
                    <label
                      key={t.id}
                      className="flex items-center gap-2 p-2.5 text-sm cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800"
                    >
                      <input
                        type="checkbox"
                        checked={taskDeps.includes(t.id)}
                        onChange={(e) => {
                          if (e.target.checked) setTaskDeps((prev) => [...prev, t.id]);
                          else setTaskDeps((prev) => prev.filter((x) => x !== t.id));
                        }}
                        className="rounded text-amber-500 focus:ring-amber-500"
                      />
                      <span className="text-stone-700 dark:text-stone-200">{t.name}</span>
                      <span
                        className={cn(
                          'ml-auto text-[10px] px-1.5 py-0.5 rounded',
                          STATUS_CONFIG[t.status].bg,
                          STATUS_CONFIG[t.status].color
                        )}
                      >
                        {STATUS_CONFIG[t.status].label}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
            <ModalFooter
              onCancel={() => {
                resetTaskForm();
                setShowTaskModal(false);
              }}
              onSubmitText="创建任务"
              disabled={!taskName}
            />
          </form>
        </Modal>
      )}

      {/* New Exhibit Modal */}
      {showExhibitModal && (
        <Modal title="添加展品" onClose={() => setShowExhibitModal(false)}>
          <form onSubmit={handleSubmitExhibit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                展品名称 *
              </label>
              <input
                type="text"
                value={exhibitName}
                onChange={(e) => setExhibitName(e.target.value)}
                className={inputCls}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                  艺术家
                </label>
                <input
                  type="text"
                  value={exhibitArtist}
                  onChange={(e) => setExhibitArtist(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                  创作年份
                </label>
                <input
                  type="text"
                  value={exhibitYear}
                  onChange={(e) => setExhibitYear(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 p-3 rounded-lg border border-stone-200 dark:border-stone-700 cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/50">
                <input
                  type="checkbox"
                  checked={isKeyExhibit}
                  onChange={(e) => {
                    const val = e.target.checked;
                    setIsKeyExhibit(val);
                    if (val) setNeedsThermo(true);
                  }}
                  className="rounded text-amber-500 focus:ring-amber-500"
                />
                <span className="text-sm font-medium text-stone-700 dark:text-stone-200">重点展品</span>
              </label>
              <label className="flex items-center gap-2 p-3 rounded-lg border border-stone-200 dark:border-stone-700 cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/50">
                <input
                  type="checkbox"
                  checked={needsThermo || isKeyExhibit}
                  onChange={(e) => !isKeyExhibit && setNeedsThermo(e.target.checked)}
                  disabled={isKeyExhibit}
                  className="rounded text-amber-500 focus:ring-amber-500 disabled:opacity-50"
                />
                <span className="text-sm font-medium text-stone-700 dark:text-stone-200">
                  需恒温柜 {isKeyExhibit && '(重点展品必选)'}
                </span>
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                当前状态
              </label>
              <select
                value={exhibitStatus}
                onChange={(e) => setExhibitStatus(e.target.value as Exhibit['status'])}
                className={inputCls}
              >
                <option value="not_arrived">{EXHIBIT_STATUS_LABEL.not_arrived}</option>
                <option value="in_storage">{EXHIBIT_STATUS_LABEL.in_storage}</option>
                <option value="placed">{EXHIBIT_STATUS_LABEL.placed}</option>
                <option value="in_position">{EXHIBIT_STATUS_LABEL.in_position}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                展位位置
              </label>
              <input
                type="text"
                value={exhibitPosition}
                onChange={(e) => setExhibitPosition(e.target.value)}
                placeholder="如：A区1号位"
                className={inputCls}
              />
            </div>
            <ModalFooter
              onCancel={() => {
                resetExhibitForm();
                setShowExhibitModal(false);
              }}
              onSubmitText="添加展品"
              disabled={!exhibitName}
            />
          </form>
        </Modal>
      )}

      {/* Add Dependency Modal */}
      {showDepModal && (
        <Modal
          title="添加前置任务"
          onClose={() => setShowDepModal(null)}
        >
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {(() => {
              const currentTask = exh.tasks.find((t) => t.id === showDepModal);
              const options = exh.tasks.filter(
                (t) => t.id !== showDepModal && !currentTask?.dependencies.includes(t.id)
              );
              if (options.length === 0) {
                return (
                  <p className="text-sm text-stone-500 dark:text-stone-400 py-8 text-center">
                    暂无可添加的前置任务
                  </p>
                );
              }
              return options.map((t) => {
                const sCfg = STATUS_CONFIG[t.status];
                const Icon = CATEGORY_CONFIG[t.category].icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      addTaskDependency(showDepModal, t.id);
                      setShowDepModal(null);
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-stone-200 dark:border-stone-700 hover:border-amber-300 dark:hover:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-all text-left"
                  >
                    <Icon className={cn('w-4 h-4', CATEGORY_CONFIG[t.category].color)} />
                    <span className="flex-1 text-sm font-medium text-stone-700 dark:text-stone-200 truncate">
                      {t.name}
                    </span>
                    <span
                      className={cn(
                        'text-[10px] px-2 py-0.5 rounded font-medium',
                        sCfg.bg,
                        sCfg.color
                      )}
                    >
                      {sCfg.label} {t.progress}%
                    </span>
                  </button>
                );
              });
            })()}
          </div>
          <div className="mt-5 flex justify-end">
            <button
              onClick={() => setShowDepModal(null)}
              className="px-4 py-2 rounded-lg border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 text-sm font-medium hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
            >
              取消
            </button>
          </div>
        </Modal>
      )}

      {/* Update Progress Modal */}
      {showProgressModal && (
        <Modal title="更新进度" onClose={() => setShowProgressModal(null)}>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-stone-700 dark:text-stone-300">完成度</label>
                <span className="text-2xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                  {progressVal}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={progressVal}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setProgressVal(v);
                  if (v === 100) setProgressStatus('completed');
                  else if (v === 0) setProgressStatus('pending');
                  else setProgressStatus('in_progress');
                }}
                className="w-full accent-amber-500"
              />
              <div className="flex justify-between text-xs text-stone-400 mt-1">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                任务状态
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['pending', 'in_progress', 'completed'] as TaskStatus[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setProgressStatus(s);
                      if (s === 'completed') setProgressVal(100);
                      else if (s === 'pending') setProgressVal(0);
                    }}
                    className={cn(
                      'py-2 rounded-lg border text-sm font-medium transition-all',
                      progressStatus === s
                        ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                        : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:border-stone-300 dark:hover:border-stone-600'
                    )}
                  >
                    {STATUS_CONFIG[s].label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                进度说明（可选）
              </label>
              <textarea
                value={progressComment}
                onChange={(e) => setProgressComment(e.target.value)}
                rows={2}
                placeholder="描述本次进度更新的内容..."
                className={cn(inputCls, 'resize-none')}
              />
            </div>

            <ModalFooter
              onCancel={() => setShowProgressModal(null)}
              onSubmitText="提交更新"
              onSubmit={handleSubmitProgress}
            />
          </div>
        </Modal>
      )}

      {/* Toasts */}
      <div className="fixed bottom-6 right-6 z-50 space-y-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'px-4 py-3 rounded-lg shadow-lg backdrop-blur-sm text-sm font-medium animate-in slide-in-from-right',
              t.type === 'success' && 'bg-emerald-500/90 text-white',
              t.type === 'error' && 'bg-rose-500/90 text-white',
              t.type === 'info' && 'bg-sky-500/90 text-white'
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}

const inputCls =
  'w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none';

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-stone-900 rounded-2xl w-full max-w-lg shadow-2xl border border-stone-200 dark:border-stone-800 max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between shrink-0">
          <h3 className="text-lg font-bold text-stone-800 dark:text-stone-100">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 transition-colors"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({
  onCancel,
  onSubmitText,
  onSubmit,
  disabled,
}: {
  onCancel: () => void;
  onSubmitText: string;
  onSubmit?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-3 pt-2">
      <button
        type="button"
        onClick={onCancel}
        className="flex-1 px-4 py-2.5 rounded-lg border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 text-sm font-medium hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
      >
        取消
      </button>
      <button
        type={onSubmit ? 'button' : 'submit'}
        onClick={onSubmit}
        disabled={disabled}
        className={cn(
          'flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all',
          disabled
            ? 'bg-stone-200 dark:bg-stone-800 text-stone-400 cursor-not-allowed'
            : 'bg-gradient-to-r from-amber-500 to-rose-500 text-white hover:shadow-lg active:scale-[0.98]'
        )}
      >
        {onSubmitText}
      </button>
    </div>
  );
}
