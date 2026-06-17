import { useAppStore } from '../store/appStore.js';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  Plus,
  Eye,
  Calendar,
  Lock,
  Unlock,
  LogOut,
  Building2,
  CheckCircle2,
  ListTodo,
  Palette,
} from 'lucide-react';
import { cn } from '../lib/utils.js';

export default function Dashboard() {
  const navigate = useNavigate();
  const {
    currentUser,
    exhibitions,
    loadExhibitions,
    createExhibition,
    loading,
    toasts,
    setCurrentUser,
  } = useAppStore();

  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    if (!currentUser) {
      navigate('/');
      return;
    }
    loadExhibitions();
  }, [currentUser, navigate, loadExhibitions]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !currentUser) return;
    try {
      await createExhibition({
        name,
        description: desc,
        start_date: startDate || null,
        end_date: endDate || null,
        created_by: currentUser.id,
      });
      setShowModal(false);
      setName('');
      setDesc('');
      setStartDate('');
      setEndDate('');
    } catch {
      // handled
    }
  };

  const roleLabel: Record<string, string> = {
    curator: '策展人',
    worker: '施工队',
    director: '馆长',
  };

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-rose-500 flex items-center justify-center shadow-md">
              <Palette className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-stone-800 dark:text-stone-100">美术馆布展系统</h1>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                当前身份: {roleLabel[currentUser?.role || '']} · {currentUser?.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {currentUser?.role === 'curator' && (
              <button
                onClick={() => setShowModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium hover:shadow-lg transition-all active:scale-[0.98]"
              >
                <Plus className="w-4 h-4" />
                新建展区
              </button>
            )}
            <button
              onClick={() => {
                setCurrentUser(null);
                navigate('/');
              }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              退出
            </button>
          </div>
        </div>
      </header>

      {/* Stats */}
      <div className="max-w-7xl mx-auto px-6 pt-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white dark:bg-stone-900 rounded-xl p-5 border border-stone-200 dark:border-stone-800 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-lg bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-sky-600 dark:text-sky-400" />
              </div>
              <div>
                <div className="text-xs text-stone-500 dark:text-stone-400">展区总数</div>
                <div className="text-2xl font-bold text-stone-800 dark:text-stone-100">{exhibitions.length}</div>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-stone-900 rounded-xl p-5 border border-stone-200 dark:border-stone-800 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <div className="text-xs text-stone-500 dark:text-stone-400">已确认开幕</div>
                <div className="text-2xl font-bold text-stone-800 dark:text-stone-100">
                  {exhibitions.filter((e) => e.opening_confirmed).length}
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-stone-900 rounded-xl p-5 border border-stone-200 dark:border-stone-800 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                <ListTodo className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <div className="text-xs text-stone-500 dark:text-stone-400">布展中</div>
                <div className="text-2xl font-bold text-stone-800 dark:text-stone-100">
                  {exhibitions.filter((e) => !e.opening_confirmed).length}
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-stone-900 rounded-xl p-5 border border-stone-200 dark:border-stone-800 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-lg bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center">
                <Lock className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <div className="text-xs text-stone-500 dark:text-stone-400">已锁定（只读）</div>
                <div className="text-2xl font-bold text-stone-800 dark:text-stone-100">
                  {exhibitions.filter((e) => e.read_only).length}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Exhibitions list */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-stone-800 dark:text-stone-100">展区列表</h2>
        </div>

        {loading && exhibitions.length === 0 ? (
          <div className="bg-white dark:bg-stone-900 rounded-xl p-12 border border-stone-200 dark:border-stone-800 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full mx-auto mb-3"></div>
            <p className="text-stone-500 dark:text-stone-400">加载中...</p>
          </div>
        ) : exhibitions.length === 0 ? (
          <div className="bg-white dark:bg-stone-900 rounded-xl p-12 border border-stone-200 dark:border-stone-800 text-center">
            <Building2 className="w-12 h-12 mx-auto mb-3 text-stone-300 dark:text-stone-700" />
            <p className="text-stone-500 dark:text-stone-400 mb-4">暂无展区</p>
            {currentUser?.role === 'curator' && (
              <button
                onClick={() => setShowModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-white text-sm hover:bg-amber-600 transition-colors"
              >
                <Plus className="w-4 h-4" />
                创建第一个展区
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
            {exhibitions.map((exh) => (
              <div
                key={exh.id}
                className={cn(
                  'group bg-white dark:bg-stone-900 rounded-xl p-5 border transition-all hover:shadow-lg',
                  exh.read_only
                    ? 'border-rose-200 dark:border-rose-900/50'
                    : 'border-stone-200 dark:border-stone-800 hover:border-amber-300 dark:hover:border-amber-800'
                )}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-bold text-stone-800 dark:text-stone-100 text-lg mb-1 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                      {exh.name}
                    </h3>
                    {exh.description && (
                      <p className="text-sm text-stone-500 dark:text-stone-400 line-clamp-2">
                        {exh.description}
                      </p>
                    )}
                  </div>
                  {exh.read_only ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 text-xs font-medium whitespace-nowrap">
                      <Lock className="w-3 h-3" />
                      已开幕
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-medium whitespace-nowrap">
                      <Unlock className="w-3 h-3" />
                      布展中
                    </span>
                  )}
                </div>

                {(exh.start_date || exh.end_date) && (
                  <div className="flex items-center gap-1 text-xs text-stone-500 dark:text-stone-400 mb-4">
                    <Calendar className="w-3 h-3" />
                    {exh.start_date && <span>{exh.start_date.split('T')[0]}</span>}
                    {exh.start_date && exh.end_date && <span> ~ </span>}
                    {exh.end_date && <span>{exh.end_date.split('T')[0]}</span>}
                  </div>
                )}

                {exh.opening_confirmed_at && (
                  <div className="text-xs text-stone-400 dark:text-stone-500 mb-3">
                    开幕确认于 {new Date(exh.opening_confirmed_at).toLocaleString('zh-CN')}
                  </div>
                )}

                <button
                  onClick={() => navigate(`/exhibition/${exh.id}`)}
                  className="w-full inline-flex items-center justify-center gap-2 py-2 rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200 font-medium text-sm hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  查看详情
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-stone-900 rounded-2xl w-full max-w-lg shadow-2xl border border-stone-200 dark:border-stone-800">
            <div className="p-6 border-b border-stone-200 dark:border-stone-800">
              <h3 className="text-xl font-bold text-stone-800 dark:text-stone-100">新建展区</h3>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                  展区名称 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="如：现代艺术特展"
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                  展区描述
                </label>
                <textarea
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="展区简介、主题等"
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                    开展日期
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                    结束日期
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 rounded-lg border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 font-medium hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={!name}
                  className={cn(
                    'flex-1 px-4 py-2 rounded-lg font-medium transition-all',
                    !name
                      ? 'bg-stone-200 dark:bg-stone-800 text-stone-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:shadow-lg'
                  )}
                >
                  创建展区
                </button>
              </div>
            </form>
          </div>
        </div>
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
