import { create } from 'zustand';
import type {
  Exhibition,
  Task,
  Exhibit,
  CreateExhibitionRequest,
  CreateTaskRequest,
  CreateExhibitRequest,
  UpdateTaskProgressRequest,
  ExhibitionWithDetails,
  TaskAuditLog,
} from '../../shared/types';

interface AppState {
  exhibitions: Exhibition[];
  currentExhibition: ExhibitionWithDetails | null;
  auditLogs: Record<string, TaskAuditLog[]>;
  loading: boolean;
  error: string | null;

  fetchExhibitions: () => Promise<void>;
  fetchExhibition: (id: string) => Promise<void>;
  createExhibition: (req: CreateExhibitionRequest) => Promise<Exhibition>;
  deleteExhibition: (id: string) => Promise<void>;

  confirmOpening: (id: string, confirmedBy: string) => Promise<void>;
  triggerAnomaly: (id: string, reason: string, triggeredBy: string) => Promise<void>;
  resolveAnomaly: (id: string, resolvedBy: string) => Promise<void>;
  setTeardownResponsible: (id: string, responsible: string, changedBy: string) => Promise<void>;

  createTask: (req: CreateTaskRequest) => Promise<Task>;
  updateTaskProgress: (id: string, req: UpdateTaskProgressRequest) => Promise<void>;
  updateTask: (id: string, updates: Partial<CreateTaskRequest> & { changed_by?: string; reason?: string }) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  addDependency: (taskId: string, depId: string) => Promise<void>;
  removeDependency: (taskId: string, depId: string) => Promise<void>;

  createExhibit: (req: CreateExhibitRequest) => Promise<Exhibit>;
  confirmThermostat: (exhibitId: string, confirmedBy: string) => Promise<void>;
  confirmRestoration: (exhibitId: string, confirmedBy: string, reason?: string) => Promise<void>;
  deleteExhibit: (id: string) => Promise<void>;

  setError: (error: string | null) => void;
}

const API_BASE = '/api';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const json = (await res.json()) as { success: boolean; data?: T; error?: string };
  if (!json.success || !res.ok) {
    throw new Error(json.error || `Request failed: ${res.status}`);
  }
  return json.data as T;
}

export const useAppStore = create<AppState>((set, get) => ({
  exhibitions: [],
  currentExhibition: null,
  auditLogs: {},
  loading: false,
  error: null,

  setError: (error) => set({ error }),

  fetchExhibitions: async () => {
    set({ loading: true, error: null });
    try {
      const data = await apiFetch<Exhibition[]>('/exhibitions');
      set({ exhibitions: data });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to fetch exhibitions' });
    } finally {
      set({ loading: false });
    }
  },

  fetchExhibition: async (id) => {
    set({ loading: true, error: null });
    try {
      const data = await apiFetch<ExhibitionWithDetails>(`/exhibitions/${id}`);
      set({ currentExhibition: data });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to fetch exhibition' });
    } finally {
      set({ loading: false });
    }
  },

  createExhibition: async (req) => {
    set({ loading: true, error: null });
    try {
      const data = await apiFetch<Exhibition>('/exhibitions', {
        method: 'POST',
        body: JSON.stringify(req),
      });
      set({ exhibitions: [...get().exhibitions, data] });
      return data;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create exhibition';
      set({ error: msg });
      throw e;
    } finally {
      set({ loading: false });
    }
  },

  deleteExhibition: async (id) => {
    set({ loading: true, error: null });
    try {
      await apiFetch(`/exhibitions/${id}`, { method: 'DELETE' });
      set({
        exhibitions: get().exhibitions.filter((e) => e.id !== id),
        currentExhibition: get().currentExhibition?.id === id ? null : get().currentExhibition,
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to delete exhibition' });
    } finally {
      set({ loading: false });
    }
  },

  confirmOpening: async (id, confirmedBy) => {
    set({ loading: true, error: null });
    try {
      await apiFetch(`/exhibitions/${id}/confirm-opening`, {
        method: 'POST',
        body: JSON.stringify({ confirmed_by: confirmedBy }),
      });
      await get().fetchExhibition(id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to confirm opening';
      set({ error: msg });
      throw e;
    } finally {
      set({ loading: false });
    }
  },

  triggerAnomaly: async (id, reason, triggeredBy) => {
    set({ loading: true, error: null });
    try {
      await apiFetch(`/exhibitions/${id}/trigger-anomaly`, {
        method: 'POST',
        body: JSON.stringify({ reason, triggered_by: triggeredBy }),
      });
      await get().fetchExhibition(id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to trigger anomaly';
      set({ error: msg });
      throw e;
    } finally {
      set({ loading: false });
    }
  },

  resolveAnomaly: async (id, resolvedBy) => {
    set({ loading: true, error: null });
    try {
      await apiFetch(`/exhibitions/${id}/resolve-anomaly`, {
        method: 'POST',
        body: JSON.stringify({ resolved_by: resolvedBy }),
      });
      await get().fetchExhibition(id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to resolve anomaly';
      set({ error: msg });
      throw e;
    } finally {
      set({ loading: false });
    }
  },

  setTeardownResponsible: async (id, responsible, changedBy) => {
    set({ loading: true, error: null });
    try {
      await apiFetch(`/exhibitions/${id}/teardown-responsible`, {
        method: 'PUT',
        body: JSON.stringify({ teardown_responsible: responsible, changed_by: changedBy }),
      });
      await get().fetchExhibition(id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to set teardown responsible';
      set({ error: msg });
      throw e;
    } finally {
      set({ loading: false });
    }
  },

  createTask: async (req) => {
    set({ loading: true, error: null });
    try {
      const data = await apiFetch<Task>('/tasks', {
        method: 'POST',
        body: JSON.stringify(req),
      });
      if (get().currentExhibition) {
        await get().fetchExhibition(get().currentExhibition.id);
      }
      return data;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create task';
      set({ error: msg });
      throw e;
    } finally {
      set({ loading: false });
    }
  },

  updateTask: async (id, updates) => {
    set({ loading: true, error: null });
    try {
      await apiFetch(`/tasks/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      if (get().currentExhibition) {
        await get().fetchExhibition(get().currentExhibition.id);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to update task';
      set({ error: msg });
      throw e;
    } finally {
      set({ loading: false });
    }
  },

  updateTaskProgress: async (id, req) => {
    set({ loading: true, error: null });
    try {
      await apiFetch(`/tasks/${id}/update-progress`, {
        method: 'POST',
        body: JSON.stringify(req),
      });
      if (get().currentExhibition) {
        await get().fetchExhibition(get().currentExhibition.id);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to update progress';
      set({ error: msg });
      throw e;
    } finally {
      set({ loading: false });
    }
  },

  deleteTask: async (id) => {
    set({ loading: true, error: null });
    try {
      await apiFetch(`/tasks/${id}`, { method: 'DELETE' });
      if (get().currentExhibition) {
        await get().fetchExhibition(get().currentExhibition.id);
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to delete task' });
    } finally {
      set({ loading: false });
    }
  },

  addDependency: async (taskId, depId) => {
    set({ loading: true, error: null });
    try {
      await apiFetch(`/tasks/${taskId}/dependencies`, {
        method: 'POST',
        body: JSON.stringify({ dep_id: depId, added_by: 'curator' }),
      });
      if (get().currentExhibition) {
        await get().fetchExhibition(get().currentExhibition.id);
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to add dependency' });
    } finally {
      set({ loading: false });
    }
  },

  removeDependency: async (taskId, depId) => {
    set({ loading: true, error: null });
    try {
      await apiFetch(`/tasks/${taskId}/dependencies/${depId}`, {
        method: 'DELETE',
      });
      if (get().currentExhibition) {
        await get().fetchExhibition(get().currentExhibition.id);
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to remove dependency' });
    } finally {
      set({ loading: false });
    }
  },

  createExhibit: async (req) => {
    set({ loading: true, error: null });
    try {
      const data = await apiFetch<Exhibit>('/exhibits', {
        method: 'POST',
        body: JSON.stringify(req),
      });
      if (get().currentExhibition) {
        await get().fetchExhibition(get().currentExhibition.id);
      }
      return data;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create exhibit';
      set({ error: msg });
      throw e;
    } finally {
      set({ loading: false });
    }
  },

  confirmThermostat: async (exhibitId, confirmedBy) => {
    set({ loading: true, error: null });
    try {
      await apiFetch(`/exhibits/${exhibitId}/confirm-thermostat`, {
        method: 'POST',
        body: JSON.stringify({ confirmed_by: confirmedBy }),
      });
      if (get().currentExhibition) {
        await get().fetchExhibition(get().currentExhibition.id);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to confirm thermostat';
      set({ error: msg });
      throw e;
    } finally {
      set({ loading: false });
    }
  },

  confirmRestoration: async (exhibitId, confirmedBy, reason) => {
    set({ loading: true, error: null });
    try {
      await apiFetch(`/exhibits/${exhibitId}/confirm-restoration`, {
        method: 'POST',
        body: JSON.stringify({ confirmed_by: confirmedBy, reason }),
      });
      if (get().currentExhibition) {
        await get().fetchExhibition(get().currentExhibition.id);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to confirm restoration';
      set({ error: msg });
      throw e;
    } finally {
      set({ loading: false });
    }
  },

  deleteExhibit: async (id) => {
    set({ loading: true, error: null });
    try {
      await apiFetch(`/exhibits/${id}`, { method: 'DELETE' });
      if (get().currentExhibition) {
        await get().fetchExhibition(get().currentExhibition.id);
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to delete exhibit' });
    } finally {
      set({ loading: false });
    }
  },
}));
