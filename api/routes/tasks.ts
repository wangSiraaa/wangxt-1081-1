import { Router, type Request, type Response } from 'express';
import db from '../src/db/index.js';
import type {
  Task,
  TaskDependency,
  ProgressUpdate,
  ApiResponse,
  TaskStatus,
  TaskCategory,
  UserRole,
  TaskPhase,
  InsuranceStatus,
  LightingCheckStatus,
  TaskAuditLog,
  AuditLogType,
} from '../../shared/types.js';

function generateId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const router = Router();

function isExhibitionReadOnly(exhibitionId: string): { readOnly: boolean; anomalyReadOnly: boolean; reason: string | null } {
  const row = db
    .prepare('SELECT read_only, anomaly_readonly, anomaly_reason FROM exhibitions WHERE id = ?')
    .get(exhibitionId) as
    | { read_only: number; anomaly_readonly: number; anomaly_reason: string | null }
    | undefined;
  if (!row) return { readOnly: false, anomalyReadOnly: false, reason: null };
  return {
    readOnly: !!row.read_only,
    anomalyReadOnly: !!row.anomaly_readonly,
    reason: row.anomaly_reason,
  };
}

function isEffectivelyReadOnly(exhibitionId: string): boolean {
  const s = isExhibitionReadOnly(exhibitionId);
  return s.readOnly || s.anomalyReadOnly;
}

function insertAuditLog(
  taskId: string,
  exhibitionId: string,
  logType: AuditLogType,
  oldValue: string | null,
  newValue: string | null,
  reason: string | null,
  changedBy: string
): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO task_audit_logs (id, task_id, exhibition_id, log_type, old_value, new_value, reason, changed_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(generateId('audit'), taskId, exhibitionId, logType, oldValue, newValue, reason, changedBy, now);
}

function recalculateEarliestStarts(exhibitionId: string): void {
  const tasks = db
    .prepare(
      `SELECT t.*, 
              (SELECT GROUP_CONCAT(depends_on_task_id) FROM task_dependencies WHERE task_id = t.id) as deps_csv
       FROM tasks t 
       WHERE t.exhibition_id = ? 
       ORDER BY COALESCE(t.hoisting_order, 9999), t.created_at`
    )
    .all(exhibitionId) as (Task & { deps_csv: string | null })[];

  const taskMap = new Map<string, Task & { deps_csv: string | null }>();
  for (const t of tasks) taskMap.set(t.id, t);

  const completedDates = new Map<string, string | null>();
  for (const t of tasks) {
    completedDates.set(t.id, t.status === 'completed' ? t.completed_at || t.updated_at : null);
  }

  const visited = new Set<string>();
  function computeEarliest(taskId: string): string | null {
    if (visited.has(taskId)) {
      const t = taskMap.get(taskId);
      return t?.earliest_start || null;
    }
    visited.add(taskId);
    const task = taskMap.get(taskId);
    if (!task) return null;

    if (task.status === 'completed') {
      return completedDates.get(taskId) || null;
    }

    const deps = task.deps_csv ? task.deps_csv.split(',') : [];
    let earliest: Date | null = null;

    for (const depId of deps) {
      const dep = taskMap.get(depId);
      if (!dep) continue;
      const depDate = completedDates.get(depId) || computeEarliest(depId);
      if (depDate) {
        const d = new Date(depDate);
        d.setHours(d.getHours() + 4);
        if (!earliest || d > earliest) earliest = d;
      }
    }

    if (task.hoisting_order !== null && task.hoisting_order !== undefined) {
      const prevHoisting = tasks.find(
        (t) =>
          t.category === 'installation' &&
          t.hoisting_order !== null &&
          t.hoisting_order !== undefined &&
          t.hoisting_order < (task.hoisting_order || 0)
      );
      if (prevHoisting) {
        const prevDate = completedDates.get(prevHoisting.id) || computeEarliest(prevHoisting.id);
        if (prevDate) {
          const d = new Date(prevDate);
          d.setHours(d.getHours() + 2);
          if (!earliest || d > earliest) earliest = d;
        }
      }
    }

    const result = earliest ? earliest.toISOString() : null;
    db.prepare(`UPDATE tasks SET earliest_start = ? WHERE id = ?`).run(result, taskId);
    return result;
  }

  for (const t of tasks) {
    computeEarliest(t.id);
  }
}

function checkDependencies(taskId: string): { allMet: boolean; pending: { id: string; name: string; status: string }[] } {
  const deps = db
    .prepare(
      `SELECT t.id, t.name, t.status FROM task_dependencies td
       INNER JOIN tasks t ON td.depends_on_task_id = t.id
       WHERE td.task_id = ?`
    )
    .all(taskId) as { id: string; name: string; status: string }[];
  const pending = deps.filter((d) => d.status !== 'completed');
  return { allMet: pending.length === 0, pending };
}

router.get('/', (req: Request, res: Response): void => {
  try {
    const { exhibition_id } = req.query;
    let query = 'SELECT * FROM tasks';
    const params: unknown[] = [];
    if (exhibition_id) {
      query += ' WHERE exhibition_id = ?';
      params.push(exhibition_id);
    }
    query += ' ORDER BY created_at';
    const tasks = db.prepare(query).all(...params) as Task[];
    res.json({ success: true, data: tasks } as ApiResponse<Task[]>);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch tasks',
    } as ApiResponse);
  }
});

router.get('/:id', (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined;
    if (!task) {
      res.status(404).json({ success: false, error: 'Task not found' } as ApiResponse);
      return;
    }
    const deps = db
      .prepare('SELECT depends_on_task_id FROM task_dependencies WHERE task_id = ?')
      .all(id) as { depends_on_task_id: string }[];
    const dependents = db
      .prepare('SELECT task_id FROM task_dependencies WHERE depends_on_task_id = ?')
      .all(id) as { task_id: string }[];
    const progressUpdates = db
      .prepare('SELECT * FROM progress_updates WHERE task_id = ? ORDER BY created_at DESC')
      .all(id) as ProgressUpdate[];
    const auditLogs = db
      .prepare('SELECT * FROM task_audit_logs WHERE task_id = ? ORDER BY created_at DESC')
      .all(id) as TaskAuditLog[];

    res.json({
      success: true,
      data: {
        ...task,
        dependencies: deps.map((d) => d.depends_on_task_id),
        dependents: dependents.map((d) => d.task_id),
        progress_updates: progressUpdates,
        audit_logs: auditLogs,
      },
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch task',
    } as ApiResponse);
  }
});

router.post('/', (req: Request, res: Response): void => {
  try {
    const {
      exhibition_id,
      name,
      description,
      phase,
      category,
      assignee_role,
      assigned_to,
      due_date,
      transport_window_start,
      transport_window_end,
      insurance_status,
      lighting_check,
      hoisting_order,
      created_by,
      dependencies,
      reason,
    } = req.body as Partial<Task> & {
      created_by?: string;
      dependencies?: string[];
      reason?: string;
    };

    if (!exhibition_id || !name || !category || !assignee_role || !created_by) {
      res.status(400).json({
        success: false,
        error: 'exhibition_id, name, category, assignee_role, created_by are required',
      } as ApiResponse);
      return;
    }

    if (isEffectivelyReadOnly(exhibition_id)) {
      const s = isExhibitionReadOnly(exhibition_id);
      const msg = s.anomalyReadOnly
        ? `Exhibition is read-only due to anomaly: ${s.reason || 'unknown'}`
        : 'Exhibition is read-only after opening';
      res.status(403).json({ success: false, error: msg } as ApiResponse);
      return;
    }

    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(created_by) as { id: string } | undefined;
    if (!user) {
      res.status(400).json({ success: false, error: 'Invalid created_by user' } as ApiResponse);
      return;
    }

    const id = generateId('task');
    const now = new Date().toISOString();
    const actualPhase: TaskPhase = phase || 'pre_exhibition';

    db.prepare(
      `INSERT INTO tasks (id, exhibition_id, name, description, phase, category, status, progress,
       assignee_role, assigned_to, due_date, transport_window_start, transport_window_end,
       insurance_status, lighting_check, hoisting_order, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      exhibition_id,
      name,
      description || '',
      actualPhase,
      category as TaskCategory,
      assignee_role as UserRole,
      assigned_to || null,
      due_date || null,
      transport_window_start || null,
      transport_window_end || null,
      (insurance_status as InsuranceStatus) || 'not_insured',
      (lighting_check as LightingCheckStatus) || 'pending',
      hoisting_order ?? null,
      now,
      now,
      created_by
    );

    if (dependencies && dependencies.length > 0) {
      const insertDep = db.prepare(
        'INSERT INTO task_dependencies (id, task_id, depends_on_task_id) VALUES (?, ?, ?)'
      );
      for (const depId of dependencies) {
        if (depId === id) continue;
        insertDep.run(generateId('dep'), id, depId);
      }
    }

    insertAuditLog(id, exhibition_id, 'review', null, 'created', reason || `Task created by ${created_by}`, created_by);

    recalculateEarliestStarts(exhibition_id);

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task;
    res.json({ success: true, data: task, message: 'Task created' } as ApiResponse<Task>);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create task',
    } as ApiResponse);
  }
});

router.put('/:id', (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      phase,
      category,
      assignee_role,
      assigned_to,
      due_date,
      transport_window_start,
      transport_window_end,
      insurance_status,
      lighting_check,
      hoisting_order,
      notes,
      status,
      updated_by,
      reason,
    } = req.body as Partial<Task> & { updated_by?: string; reason?: string };

    if (!updated_by) {
      res.status(400).json({ success: false, error: 'updated_by is required' } as ApiResponse);
      return;
    }

    const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined;
    if (!existing) {
      res.status(404).json({ success: false, error: 'Task not found' } as ApiResponse);
      return;
    }

    if (isEffectivelyReadOnly(existing.exhibition_id)) {
      const s = isExhibitionReadOnly(existing.exhibition_id);
      const msg = s.anomalyReadOnly
        ? `Exhibition is read-only due to anomaly: ${s.reason || 'unknown'}`
        : 'Exhibition is read-only after opening';
      res.status(403).json({ success: false, error: msg } as ApiResponse);
      return;
    }

    const now = new Date().toISOString();
    const dueDateChanged = due_date !== undefined && due_date !== existing.due_date;
    const phaseChanged = phase !== undefined && phase !== existing.phase;
    const statusChanged = status !== undefined && status !== existing.status;

    db.prepare(
      `UPDATE tasks SET 
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        phase = COALESCE(?, phase),
        category = COALESCE(?, category),
        assignee_role = COALESCE(?, assignee_role),
        assigned_to = ?,
        due_date = ?,
        transport_window_start = ?,
        transport_window_end = ?,
        insurance_status = COALESCE(?, insurance_status),
        lighting_check = COALESCE(?, lighting_check),
        hoisting_order = ?,
        notes = COALESCE(?, notes),
        status = COALESCE(?, status),
        updated_at = ?
       WHERE id = ?`
    ).run(
      name ?? null,
      description ?? null,
      phase ?? null,
      category ?? null,
      assignee_role ?? null,
      assigned_to ?? null,
      due_date ?? null,
      transport_window_start ?? null,
      transport_window_end ?? null,
      insurance_status ?? null,
      lighting_check ?? null,
      hoisting_order ?? null,
      notes ?? null,
      status ?? null,
      now,
      id
    );

    if (dueDateChanged) {
      insertAuditLog(
        id,
        existing.exhibition_id,
        'reschedule',
        existing.due_date,
        due_date || null,
        reason || `Due date changed by ${updated_by}`,
        updated_by
      );
    }
    if (phaseChanged) {
      insertAuditLog(
        id,
        existing.exhibition_id,
        'phase_change',
        existing.phase,
        phase || null,
        reason || `Phase changed by ${updated_by}`,
        updated_by
      );
    }
    if (statusChanged && status === 'blocked') {
      insertAuditLog(
        id,
        existing.exhibition_id,
        'closure',
        existing.status,
        status || null,
        reason || `Task blocked by ${updated_by}`,
        updated_by
      );
    }
    if (statusChanged && status !== 'blocked') {
      insertAuditLog(
        id,
        existing.exhibition_id,
        'review',
        existing.status,
        status || null,
        reason || `Status changed by ${updated_by}`,
        updated_by
      );
    }

    recalculateEarliestStarts(existing.exhibition_id);

    const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task;
    res.json({ success: true, data: updated, message: 'Task updated' } as ApiResponse<Task>);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update task',
    } as ApiResponse);
  }
});

router.post('/:id/update-progress', (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    const { progress, status, comment, updated_by, reason } = req.body as {
      progress?: number;
      status?: TaskStatus;
      comment?: string;
      updated_by?: string;
      reason?: string;
    };

    if (!updated_by) {
      res.status(400).json({ success: false, error: 'updated_by is required' } as ApiResponse);
      return;
    }

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined;
    if (!task) {
      res.status(404).json({ success: false, error: 'Task not found' } as ApiResponse);
      return;
    }

    if (isEffectivelyReadOnly(task.exhibition_id)) {
      const s = isExhibitionReadOnly(task.exhibition_id);
      const msg = s.anomalyReadOnly
        ? `Exhibition is read-only due to anomaly: ${s.reason || 'unknown'}. Teardown plan and responsible person preserved.`
        : 'Exhibition is read-only after opening';
      res.status(403).json({ success: false, error: msg } as ApiResponse);
      return;
    }

    const newStatus = status || task.status;
    const newProgress = progress ?? task.progress;

    if (
      (newStatus === 'in_progress' || newProgress > 0) &&
      task.category === 'installation'
    ) {
      const depCheck = checkDependencies(id);
      if (!depCheck.allMet) {
        res.status(400).json({
          success: false,
          error: `Cannot start installation: prerequisites not met. Pending: ${depCheck.pending.map((p) => p.name).join(', ')}`,
        } as ApiResponse);
        return;
      }
      if (task.earliest_start) {
        const earliest = new Date(task.earliest_start).getTime();
        const now = Date.now();
        if (now < earliest) {
          res.status(400).json({
            success: false,
            error: `Cannot start this installation task before earliest start time: ${new Date(earliest).toLocaleString('zh-CN', { hour12: false })}`,
          } as ApiResponse);
          return;
        }
      }
    }

    const now = new Date().toISOString();
    const startedAt = newStatus === 'in_progress' && !task.started_at ? now : task.started_at;
    const completedAt = newStatus === 'completed' && !task.completed_at ? now : task.completed_at;
    const statusChanged = newStatus !== task.status;

    db.prepare(
      `UPDATE tasks SET progress = ?, status = ?, started_at = COALESCE(?, started_at),
       completed_at = ?, notes = COALESCE(?, notes), updated_at = ? WHERE id = ?`
    ).run(newProgress, newStatus, startedAt, completedAt, comment ?? null, now, id);

    db.prepare(
      'INSERT INTO progress_updates (id, task_id, progress, status, comment, updated_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(generateId('pu'), id, newProgress, newStatus, comment || null, updated_by, now);

    if (statusChanged) {
      insertAuditLog(
        id,
        task.exhibition_id,
        newStatus === 'blocked' ? 'closure' : 'review',
        task.status,
        newStatus,
        reason || comment || `Progress updated by ${updated_by}`,
        updated_by
      );
    }

    recalculateEarliestStarts(task.exhibition_id);

    const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task;
    res.json({ success: true, data: updated, message: 'Progress updated, recalculated dependent task times' } as ApiResponse<Task>);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update progress',
    } as ApiResponse);
  }
});

router.post('/:id/dependencies', (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    const { depends_on_task_id, added_by, reason } = req.body as {
      depends_on_task_id?: string;
      added_by?: string;
      reason?: string;
    };

    if (!depends_on_task_id || !added_by) {
      res.status(400).json({ success: false, error: 'depends_on_task_id and added_by are required' } as ApiResponse);
      return;
    }

    const task = db.prepare('SELECT id, exhibition_id FROM tasks WHERE id = ?').get(id) as Task | undefined;
    if (!task) {
      res.status(404).json({ success: false, error: 'Task not found' } as ApiResponse);
      return;
    }

    if (isEffectivelyReadOnly(task.exhibition_id)) {
      const s = isExhibitionReadOnly(task.exhibition_id);
      const msg = s.anomalyReadOnly
        ? `Exhibition is read-only due to anomaly: ${s.reason || 'unknown'}`
        : 'Exhibition is read-only after opening';
      res.status(403).json({ success: false, error: msg } as ApiResponse);
      return;
    }

    if (id === depends_on_task_id) {
      res.status(400).json({ success: false, error: 'Task cannot depend on itself' } as ApiResponse);
      return;
    }

    const depTask = db.prepare('SELECT id FROM tasks WHERE id = ?').get(depends_on_task_id) as { id: string } | undefined;
    if (!depTask) {
      res.status(404).json({ success: false, error: 'Dependent task not found' } as ApiResponse);
      return;
    }

    db.prepare('INSERT OR IGNORE INTO task_dependencies (id, task_id, depends_on_task_id) VALUES (?, ?, ?)').run(
      generateId('dep'),
      id,
      depends_on_task_id
    );

    insertAuditLog(
      id,
      task.exhibition_id,
      'review',
      null,
      `depends_on:${depends_on_task_id}`,
      reason || `Dependency added by ${added_by}`,
      added_by
    );

    recalculateEarliestStarts(task.exhibition_id);

    const dependencies = db
      .prepare('SELECT * FROM task_dependencies WHERE task_id = ?')
      .all(id) as TaskDependency[];
    res.json({ success: true, data: dependencies, message: 'Dependency added' } as ApiResponse<TaskDependency[]>);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add dependency',
    } as ApiResponse);
  }
});

router.delete('/:id/dependencies/:depId', (req: Request, res: Response): void => {
  try {
    const { id, depId } = req.params;
    const { removed_by, reason } = req.body as { removed_by?: string; reason?: string } | undefined;

    const task = db.prepare('SELECT id, exhibition_id FROM tasks WHERE id = ?').get(id) as Task | undefined;
    if (!task) {
      res.status(404).json({ success: false, error: 'Task not found' } as ApiResponse);
      return;
    }

    if (isEffectivelyReadOnly(task.exhibition_id)) {
      const s = isExhibitionReadOnly(task.exhibition_id);
      const msg = s.anomalyReadOnly
        ? `Exhibition is read-only due to anomaly: ${s.reason || 'unknown'}`
        : 'Exhibition is read-only after opening';
      res.status(403).json({ success: false, error: msg } as ApiResponse);
      return;
    }

    db.prepare('DELETE FROM task_dependencies WHERE task_id = ? AND depends_on_task_id = ?').run(id, depId);

    if (removed_by) {
      insertAuditLog(
        id,
        task.exhibition_id,
        'review',
        `depends_on:${depId}`,
        null,
        reason || `Dependency removed by ${removed_by}`,
        removed_by
      );
    }

    recalculateEarliestStarts(task.exhibition_id);

    res.json({ success: true, message: 'Dependency removed' } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove dependency',
    } as ApiResponse);
  }
});

export default router;
