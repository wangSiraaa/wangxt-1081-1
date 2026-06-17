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
} from '../../shared/types.js';

function generateId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const router = Router();

function isExhibitionReadOnly(exhibitionId: string): boolean {
  const row = db
    .prepare('SELECT read_only FROM exhibitions WHERE id = ?')
    .get(exhibitionId) as { read_only: number } | undefined;
  return !!row?.read_only;
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

    res.json({
      success: true,
      data: {
        ...task,
        dependencies: deps.map((d) => d.depends_on_task_id),
        dependents: dependents.map((d) => d.task_id),
        progress_updates: progressUpdates,
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
      category,
      assignee_role,
      due_date,
      created_by,
      dependencies,
    } = req.body as Partial<Task> & { created_by?: string; dependencies?: string[] };

    if (!exhibition_id || !name || !category || !assignee_role || !created_by) {
      res.status(400).json({
        success: false,
        error: 'exhibition_id, name, category, assignee_role, created_by are required',
      } as ApiResponse);
      return;
    }

    if (isExhibitionReadOnly(exhibition_id)) {
      res.status(403).json({ success: false, error: 'Exhibition is read-only after opening' } as ApiResponse);
      return;
    }

    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(created_by) as { id: string } | undefined;
    if (!user) {
      res.status(400).json({ success: false, error: 'Invalid created_by user' } as ApiResponse);
      return;
    }

    const id = generateId('task');
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO tasks (id, exhibition_id, name, description, category, status, progress,
       assignee_role, due_date, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?, ?)`
    ).run(
      id,
      exhibition_id,
      name,
      description || '',
      category as TaskCategory,
      assignee_role as UserRole,
      due_date || null,
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

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task;
    res.json({ success: true, data: task, message: 'Task created' } as ApiResponse<Task>);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create task',
    } as ApiResponse);
  }
});

router.post('/:id/update-progress', (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    const { progress, status, comment, updated_by } = req.body as {
      progress?: number;
      status?: TaskStatus;
      comment?: string;
      updated_by?: string;
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

    if (isExhibitionReadOnly(task.exhibition_id)) {
      res.status(403).json({ success: false, error: 'Exhibition is read-only after opening' } as ApiResponse);
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
    }

    const now = new Date().toISOString();
    const startedAt = newStatus === 'in_progress' && !task.started_at ? now : task.started_at;
    const completedAt = newStatus === 'completed' && !task.completed_at ? now : task.completed_at;

    db.prepare(
      `UPDATE tasks SET progress = ?, status = ?, started_at = COALESCE(?, started_at),
       completed_at = ?, notes = COALESCE(?, notes), updated_at = ? WHERE id = ?`
    ).run(newProgress, newStatus, startedAt, completedAt, comment ?? null, now, id);

    db.prepare(
      'INSERT INTO progress_updates (id, task_id, progress, status, comment, updated_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(generateId('pu'), id, newProgress, newStatus, comment || null, updated_by, now);

    const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task;
    res.json({ success: true, data: updated, message: 'Progress updated' } as ApiResponse<Task>);
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
    const { depends_on_task_id } = req.body as { depends_on_task_id?: string };

    if (!depends_on_task_id) {
      res.status(400).json({ success: false, error: 'depends_on_task_id is required' } as ApiResponse);
      return;
    }

    const task = db.prepare('SELECT id, exhibition_id FROM tasks WHERE id = ?').get(id) as Task | undefined;
    if (!task) {
      res.status(404).json({ success: false, error: 'Task not found' } as ApiResponse);
      return;
    }

    if (isExhibitionReadOnly(task.exhibition_id)) {
      res.status(403).json({ success: false, error: 'Exhibition is read-only after opening' } as ApiResponse);
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

    const task = db.prepare('SELECT id, exhibition_id FROM tasks WHERE id = ?').get(id) as Task | undefined;
    if (!task) {
      res.status(404).json({ success: false, error: 'Task not found' } as ApiResponse);
      return;
    }

    if (isExhibitionReadOnly(task.exhibition_id)) {
      res.status(403).json({ success: false, error: 'Exhibition is read-only after opening' } as ApiResponse);
      return;
    }

    db.prepare('DELETE FROM task_dependencies WHERE task_id = ? AND depends_on_task_id = ?').run(id, depId);
    res.json({ success: true, message: 'Dependency removed' } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove dependency',
    } as ApiResponse);
  }
});

export default router;
