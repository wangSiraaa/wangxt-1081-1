import { create } from 'zustand';
import type { User, Exhibition, ExhibitionWithDetails, Task, Exhibit, TaskStatus } from '../../shared/types.js';
import { api } from '../lib/api.js';

interface AppState {
  currentUser: User | null;
  users: User[];
  exhibitions: Exhibition[];
  currentExhibition: ExhibitionWithDetails | null;
  loading: boolean;
  error: string | null;
  toasts: { id: string; type: 'success' | 'error' | 'info'; message: string }[];

  login: (username: string) => Promise<void>;
  loadUsers: () => Promise<void>;
  loadExhibitions: () => Promise<void>;
  loadExhibition: (id: string) => Promise<void>;
  createExhibition: (data: Partial<Exhibition> & { created_by: string }) => Promise<void>;
  updateExhibition: (id: string, data: Partial<Exhibition>) => Promise<void>;
  confirmOpening: (id: string, confirmed_by: string) => Promise<void>;

  createTask: (data: {
    exhibition_id: string;
    name: string;
    description?: string;
    category: string;
    assignee_role: string;
    due_date?: string;
    created_by: string;
    dependencies?: string[];
  }) => Promise<void>;
  updateTaskProgress: (
    id: string,
    data: { progress?: number; status?: TaskStatus; comment?: string; updated_by: string }
  ) => Promise<void>;
  addTaskDependency: (taskId: string, dependsOnId: string) => Promise<void>;
  removeTaskDependency: (taskId: string, depId: string) => Promise<void>;

  createExhibit: (data: Partial<Exhibit> & { exhibition_id: string; name: string }) => Promise<void>;
  updateExhibit: (id: string, data: Partial<Exhibit>) => Promise<void>;
  confirmThermostat: (id: string, confirmed_by: string) => Promise<void>;

  setCurrentUser: (user: User | null) => void;
  showToast: (type: 'success' | 'error' | 'info', message: string) => void;
  clearError: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  currentUser: null,
  users: [],
  exhibitions: [],
  currentExhibition: null,
  loading: false,
  error: null,
  toasts: [],

  async login(username) {
    set({ loading: true, error: null });
    try {
      const resp = await api.post<User>('/auth/login', { username });
      if (resp.data) {
        set({ currentUser: resp.data });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Login failed';
      set({ error: msg });
      get().showToast('error', msg);
      throw e;
    } finally {
      set({ loading: false });
    }
  },

  async loadUsers() {
    try {
      const resp = await api.get<User[]>('/auth/users');
      if (resp.data) set({ users: resp.data });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load users';
      set({ error: msg });
    }
  },

  async loadExhibitions() {
    set({ loading: true });
    try {
      const resp = await api.get<Exhibition[]>('/exhibitions');
      if (resp.data) set({ exhibitions: resp.data });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load exhibitions';
      set({ error: msg });
      get().showToast('error', msg);
    } finally {
      set({ loading: false });
    }
  },

  async loadExhibition(id) {
    set({ loading: true, error: null });
    try {
      const resp = await api.get<ExhibitionWithDetails>(`/exhibitions/${id}`);
      if (resp.data) set({ currentExhibition: resp.data });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load exhibition';
      set({ error: msg });
      get().showToast('error', msg);
      throw e;
    } finally {
      set({ loading: false });
    }
  },

  async createExhibition(data) {
    set({ loading: true, error: null });
    try {
      const resp = await api.post<Exhibition>('/exhibitions', data);
      if (resp.data) {
        get().showToast('success', '展区创建成功');
        await get().loadExhibitions();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create exhibition';
      set({ error: msg });
      get().showToast('error', msg);
      throw e;
    } finally {
      set({ loading: false });
    }
  },

  async updateExhibition(id, data) {
    try {
      const resp = await api.put<Exhibition>(`/exhibitions/${id}`, data);
      if (resp.data) {
        get().showToast('success', '展区已更新');
        await get().loadExhibition(id);
        await get().loadExhibitions();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to update exhibition';
      set({ error: msg });
      get().showToast('error', msg);
      throw e;
    }
  },

  async confirmOpening(id, confirmed_by) {
    try {
      const resp = await api.post<Exhibition>(`/exhibitions/${id}/confirm-opening`, { confirmed_by });
      if (resp.data) {
        get().showToast('success', '开幕确认成功！展区已进入只读状态');
        await get().loadExhibition(id);
        await get().loadExhibitions();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to confirm opening';
      set({ error: msg });
      get().showToast('error', msg);
      throw e;
    }
  },

  async createTask(data) {
    try {
      const resp = await api.post<Task>('/tasks', data);
      if (resp.data) {
        get().showToast('success', '任务创建成功');
        await get().loadExhibition(data.exhibition_id);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create task';
      set({ error: msg });
      get().showToast('error', msg);
      throw e;
    }
  },

  async updateTaskProgress(id, data) {
    try {
      const resp = await api.post<Task>(`/tasks/${id}/update-progress`, data);
      if (resp.data) {
        const exh = get().currentExhibition;
        if (exh) {
          get().showToast('success', '进度已更新');
          await get().loadExhibition(exh.id);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to update progress';
      set({ error: msg });
      get().showToast('error', msg);
      throw e;
    }
  },

  async addTaskDependency(taskId, dependsOnId) {
    try {
      const resp = await api.post(`/tasks/${taskId}/dependencies`, { depends_on_task_id: dependsOnId });
      if (resp.success) {
        const exh = get().currentExhibition;
        if (exh) {
          get().showToast('success', '前置任务已添加');
          await get().loadExhibition(exh.id);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to add dependency';
      set({ error: msg });
      get().showToast('error', msg);
      throw e;
    }
  },

  async removeTaskDependency(taskId, depId) {
    try {
      const resp = await api.delete(`/tasks/${taskId}/dependencies/${depId}`);
      if (resp.success) {
        const exh = get().currentExhibition;
        if (exh) {
          get().showToast('success', '前置任务已移除');
          await get().loadExhibition(exh.id);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to remove dependency';
      set({ error: msg });
      get().showToast('error', msg);
      throw e;
    }
  },

  async createExhibit(data) {
    try {
      const resp = await api.post<Exhibit>('/exhibits', data);
      if (resp.data) {
        get().showToast('success', '展品已添加');
        await get().loadExhibition(data.exhibition_id);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create exhibit';
      set({ error: msg });
      get().showToast('error', msg);
      throw e;
    }
  },

  async updateExhibit(id, data) {
    try {
      const resp = await api.put<Exhibit>(`/exhibits/${id}`, data);
      if (resp.data) {
        const exh = get().currentExhibition;
        if (exh) {
          get().showToast('success', '展品信息已更新');
          await get().loadExhibition(exh.id);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to update exhibit';
      set({ error: msg });
      get().showToast('error', msg);
      throw e;
    }
  },

  async confirmThermostat(id, confirmed_by) {
    try {
      const resp = await api.post<Exhibit>(`/exhibits/${id}/confirm-thermostat`, { confirmed_by });
      if (resp.data) {
        const exh = get().currentExhibition;
        if (exh) {
          get().showToast('success', '恒温柜已确认');
          await get().loadExhibition(exh.id);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to confirm thermostat';
      set({ error: msg });
      get().showToast('error', msg);
      throw e;
    }
  },

  setCurrentUser(user) {
    set({ currentUser: user });
  },

  showToast(type, message) {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { id, type, message }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3500);
  },

  clearError() {
    set({ error: null });
  },
}));
