import { useAppStore } from '../store/appStore.js';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Palette, LogIn } from 'lucide-react';
import { cn } from '../lib/utils.js';

export default function LoginPage() {
  const navigate = useNavigate();
  const { users, currentUser, loadUsers, login, loading } = useAppStore();
  const [selected, setSelected] = useState<string>('');

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (currentUser) navigate('/dashboard');
  }, [currentUser, navigate]);

  const handleLogin = async (username: string) => {
    try {
      await login(username);
    } catch {
      // toast is shown by store
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-100 via-amber-50 to-stone-100 dark:from-stone-950 dark:via-stone-900 dark:to-stone-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500 to-rose-500 shadow-lg mb-5">
            <Palette className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-stone-800 dark:text-stone-100 tracking-tight">
            美术馆布展任务系统
          </h1>
          <p className="mt-2 text-stone-500 dark:text-stone-400">策展 · 施工 · 开幕 一体化管理</p>
        </div>

        <div className="bg-white dark:bg-stone-900 rounded-2xl shadow-xl border border-stone-200 dark:border-stone-800 p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-3">
              选择身份登录
            </label>
            <div className="space-y-2">
              {users.map((u) => {
                const roleColor: Record<string, string> = {
                  curator: 'from-sky-500 to-indigo-500',
                  worker: 'from-emerald-500 to-teal-500',
                  director: 'from-amber-500 to-orange-500',
                };
                const roleLabel: Record<string, string> = {
                  curator: '策展人',
                  worker: '施工队',
                  director: '馆长',
                };
                return (
                  <button
                    key={u.id}
                    onClick={() => setSelected(u.username)}
                    className={cn(
                      'w-full flex items-center gap-4 p-4 rounded-xl border transition-all text-left',
                      selected === u.username
                        ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-600 shadow-md'
                        : 'border-stone-200 dark:border-stone-700 hover:border-stone-300 dark:hover:border-stone-600'
                    )}
                  >
                    <div
                      className={cn(
                        'w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center text-white font-bold text-sm',
                        roleColor[u.role]
                      )}
                    >
                      {u.name.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-stone-800 dark:text-stone-100">{u.name}</div>
                      <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                        <span className="px-2 py-0.5 bg-stone-100 dark:bg-stone-800 rounded">
                          {roleLabel[u.role]}
                        </span>
                        <span className="ml-2">{u.username}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={() => selected && handleLogin(selected)}
            disabled={!selected || loading}
            className={cn(
              'w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold transition-all',
              !selected || loading
                ? 'bg-stone-200 dark:bg-stone-800 text-stone-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-amber-500 to-rose-500 text-white hover:shadow-lg hover:shadow-amber-500/25 active:scale-[0.98]'
            )}
          >
            <LogIn className="w-5 h-5" />
            {loading ? '登录中...' : '进入系统'}
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-stone-400 dark:text-stone-500">
          测试账号: curator1 · worker1 · director1
        </p>
      </div>
    </div>
  );
}
