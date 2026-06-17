import { Router, type Request, type Response } from 'express';
import db from '../src/db/index.js';
import type {
  Exhibition,
  ExhibitionWithDetails,
  Task,
  TaskDependency,
  Exhibit,
  ProgressUpdate,
  ApiResponse,
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

router.get('/', (req: Request, res: Response): void => {
  try {
    const exhibitions = db
      .prepare('SELECT * FROM exhibitions ORDER BY created_at DESC')
      .all() as Exhibition[];
    res.json({ success: true, data: exhibitions } as ApiResponse<Exhibition[]>);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch exhibitions',
    } as ApiResponse);
  }
});

router.get('/:id', (req: Request, res: Response): void => {
  try {
    const { id } = req.params;

    const exhibition = db
      .prepare('SELECT * FROM exhibitions WHERE id = ?')
      .get(id) as Exhibition | undefined;

    if (!exhibition) {
      res.status(404).json({ success: false, error: 'Exhibition not found' } as ApiResponse);
      return;
    }

    const tasks = db
      .prepare('SELECT * FROM tasks WHERE exhibition_id = ? ORDER BY created_at')
      .all(id) as Task[];

    const dependencies = db
      .prepare('SELECT * FROM task_dependencies WHERE task_id IN (SELECT id FROM tasks WHERE exhibition_id = ?)')
      .all(id) as TaskDependency[];

    const depMap = new Map<string, string[]>();
    const depByMap = new Map<string, string[]>();
    for (const dep of dependencies) {
      if (!depMap.has(dep.task_id)) depMap.set(dep.task_id, []);
      depMap.get(dep.task_id)!.push(dep.depends_on_task_id);
      if (!depByMap.has(dep.depends_on_task_id)) depByMap.set(dep.depends_on_task_id, []);
      depByMap.get(dep.depends_on_task_id)!.push(dep.task_id);
    }

    const progressUpdates = db
      .prepare(
        'SELECT pu.* FROM progress_updates pu INNER JOIN tasks t ON pu.task_id = t.id WHERE t.exhibition_id = ? ORDER BY pu.created_at DESC'
      )
      .all(id) as ProgressUpdate[];
    const puMap = new Map<string, ProgressUpdate[]>();
    for (const pu of progressUpdates) {
      if (!puMap.has(pu.task_id)) puMap.set(pu.task_id, []);
      puMap.get(pu.task_id)!.push(pu);
    }

    const tasksWithDetails = tasks.map((task) => ({
      ...task,
      dependencies: depMap.get(task.id) || [],
      dependents: depByMap.get(task.id) || [],
      progress_updates: puMap.get(task.id) || [],
    }));

    const exhibits = db
      .prepare('SELECT * FROM exhibits WHERE exhibition_id = ? ORDER BY created_at')
      .all(id) as Exhibit[];

    const result: ExhibitionWithDetails = {
      ...exhibition,
      tasks: tasksWithDetails,
      exhibits,
    };

    res.json({ success: true, data: result } as ApiResponse<ExhibitionWithDetails>);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch exhibition',
    } as ApiResponse);
  }
});

router.post('/', (req: Request, res: Response): void => {
  try {
    const { name, description, start_date, end_date, created_by } = req.body as Partial<Exhibition> & { created_by?: string };

    if (!name || !created_by) {
      res.status(400).json({ success: false, error: 'Name and created_by are required' } as ApiResponse);
      return;
    }

    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(created_by) as { id: string } | undefined;
    if (!user) {
      res.status(400).json({ success: false, error: 'Invalid created_by user' } as ApiResponse);
      return;
    }

    const id = generateId('exh');
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO exhibitions (id, name, description, start_date, end_date, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, name, description || '', start_date || null, end_date || null, now, now, created_by);

    const exhibition = db.prepare('SELECT * FROM exhibitions WHERE id = ?').get(id) as Exhibition;
    res.json({ success: true, data: exhibition, message: 'Exhibition created' } as ApiResponse<Exhibition>);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create exhibition',
    } as ApiResponse);
  }
});

router.put('/:id', (req: Request, res: Response): void => {
  try {
    const { id } = req.params;

    if (isExhibitionReadOnly(id)) {
      res.status(403).json({ success: false, error: 'Exhibition is read-only after opening' } as ApiResponse);
      return;
    }

    const { name, description, start_date, end_date } = req.body as Partial<Exhibition>;

    const existing = db.prepare('SELECT id FROM exhibitions WHERE id = ?').get(id) as { id: string } | undefined;
    if (!existing) {
      res.status(404).json({ success: false, error: 'Exhibition not found' } as ApiResponse);
      return;
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE exhibitions SET name = COALESCE(?, name), description = COALESCE(?, description),
       start_date = ?, end_date = ?, updated_at = ? WHERE id = ?`
    ).run(name ?? null, description ?? null, start_date ?? null, end_date ?? null, now, id);

    const exhibition = db.prepare('SELECT * FROM exhibitions WHERE id = ?').get(id) as Exhibition;
    res.json({ success: true, data: exhibition, message: 'Exhibition updated' } as ApiResponse<Exhibition>);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update exhibition',
    } as ApiResponse);
  }
});

router.post('/:id/confirm-opening', (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    const { confirmed_by } = req.body as { confirmed_by?: string };

    if (!confirmed_by) {
      res.status(400).json({ success: false, error: 'confirmed_by is required' } as ApiResponse);
      return;
    }

    const exhibition = db.prepare('SELECT * FROM exhibitions WHERE id = ?').get(id) as Exhibition | undefined;
    if (!exhibition) {
      res.status(404).json({ success: false, error: 'Exhibition not found' } as ApiResponse);
      return;
    }

    const user = db
      .prepare("SELECT id, role FROM users WHERE id = ? AND role = 'director'")
      .get(confirmed_by) as { id: string } | undefined;
    if (!user) {
      res.status(403).json({ success: false, error: 'Only directors can confirm opening' } as ApiResponse);
      return;
    }

    const installationTask = db
      .prepare("SELECT id, status FROM tasks WHERE exhibition_id = ? AND category = 'installation'")
      .get(id) as { id: string; status: string } | undefined;
    if (installationTask && installationTask.status !== 'completed') {
      res.status(400).json({ success: false, error: 'Installation task must be completed before confirming opening' } as ApiResponse);
      return;
    }

    const keyExhibitsPending = db
      .prepare(
        `SELECT COUNT(*) as count FROM exhibits WHERE exhibition_id = ? AND is_key_exhibit = 1 AND thermostat_confirmed = 0`
      )
      .get(id) as { count: number };
    if (keyExhibitsPending.count > 0) {
      res.status(400).json({
        success: false,
        error: `All key exhibits must have thermostat confirmed (${keyExhibitsPending.count} pending)`,
      } as ApiResponse);
      return;
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE exhibitions SET opening_confirmed = 1, opening_confirmed_at = ?, opening_confirmed_by = ?,
       read_only = 1, updated_at = ? WHERE id = ?`
    ).run(now, confirmed_by, now, id);

    const updated = db.prepare('SELECT * FROM exhibitions WHERE id = ?').get(id) as Exhibition;
    res.json({
      success: true,
      data: updated,
      message: 'Opening confirmed. Exhibition is now read-only.',
    } as ApiResponse<Exhibition>);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to confirm opening',
    } as ApiResponse);
  }
});

export default router;
