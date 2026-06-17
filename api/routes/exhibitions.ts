import { Router, type Request, type Response } from 'express';
import db from '../src/db/index.js';
import type {
  Exhibition,
  ExhibitionWithDetails,
  Task,
  TaskDependency,
  Exhibit,
  ProgressUpdate,
  TaskAuditLog,
  ApiResponse,
  TaskPhase,
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
      .prepare('SELECT * FROM tasks WHERE exhibition_id = ? ORDER BY COALESCE(hoisting_order, 9999), created_at')
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

    const auditLogs = db
      .prepare('SELECT * FROM task_audit_logs WHERE exhibition_id = ? ORDER BY created_at DESC')
      .all(id) as TaskAuditLog[];
    const auditMap = new Map<string, TaskAuditLog[]>();
    for (const al of auditLogs) {
      if (!auditMap.has(al.task_id)) auditMap.set(al.task_id, []);
      auditMap.get(al.task_id)!.push(al);
    }

    const tasksWithDetails = tasks.map((task) => ({
      ...task,
      dependencies: depMap.get(task.id) || [],
      dependents: depByMap.get(task.id) || [],
      progress_updates: puMap.get(task.id) || [],
      audit_logs: auditMap.get(task.id) || [],
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

    if (isEffectivelyReadOnly(id)) {
      const s = isExhibitionReadOnly(id);
      const msg = s.anomalyReadOnly
        ? `Exhibition is read-only due to anomaly: ${s.reason || 'unknown'}`
        : 'Exhibition is read-only after opening';
      res.status(403).json({ success: false, error: msg } as ApiResponse);
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

    if (isEffectivelyReadOnly(id)) {
      res.status(403).json({ success: false, error: 'Exhibition already in read-only state' } as ApiResponse);
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

    const keyExhibitsThermoPending = db
      .prepare(
        `SELECT COUNT(*) as count FROM exhibits WHERE exhibition_id = ? AND is_key_exhibit = 1 AND needs_thermostat = 1 AND thermostat_confirmed = 0`
      )
      .get(id) as { count: number };
    if (keyExhibitsThermoPending.count > 0) {
      res.status(400).json({
        success: false,
        error: `All key exhibits with thermostat needs must be confirmed (${keyExhibitsThermoPending.count} pending)`,
      } as ApiResponse);
      return;
    }

    const keyExhibitsRestorationPending = db
      .prepare(
        `SELECT COUNT(*) as count FROM exhibits WHERE exhibition_id = ? AND is_key_exhibit = 1 AND restoration_confirmed = 0`
      )
      .get(id) as { count: number };
    if (keyExhibitsRestorationPending.count > 0) {
      res.status(400).json({
        success: false,
        error: `All key exhibits must have restoration confirmed before opening (${keyExhibitsRestorationPending.count} pending)`,
      } as ApiResponse);
      return;
    }

    const preExhibitionTasks = db
      .prepare(
        `SELECT id, name, status FROM tasks WHERE exhibition_id = ? AND phase = 'pre_exhibition' AND status != 'completed'`
      )
      .all(id) as { id: string; name: string; status: string }[];
    if (preExhibitionTasks.length > 0) {
      res.status(400).json({
        success: false,
        error: `All pre-exhibition tasks must be completed. Pending: ${preExhibitionTasks.map((t) => t.name).join(', ')}`,
      } as ApiResponse);
      return;
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE exhibitions SET opening_confirmed = 1, opening_confirmed_at = ?, opening_confirmed_by = ?,
       read_only = 1, updated_at = ? WHERE id = ?`
    ).run(now, confirmed_by, now, id);

    db.prepare(`UPDATE tasks SET phase = 'opening' WHERE exhibition_id = ? AND phase = 'pre_exhibition'`).run(id);

    const openingPhaseTasks = db
      .prepare(`SELECT id FROM tasks WHERE exhibition_id = ? AND phase = 'opening'`)
      .all(id) as { id: string }[];
    for (const t of openingPhaseTasks) {
      db.prepare(
        `INSERT INTO task_audit_logs (id, task_id, exhibition_id, log_type, old_value, new_value, reason, changed_by, created_at)
         VALUES (?, ?, ?, 'phase_change', 'pre_exhibition', 'opening', 'opening confirmed by director', ?, ?)`
      ).run(generateId('audit'), t.id, id, confirmed_by, now);
    }

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

router.post('/:id/trigger-anomaly', (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    const { triggered_by, reason } = req.body as { triggered_by?: string; reason?: string };

    if (!triggered_by) {
      res.status(400).json({ success: false, error: 'triggered_by is required' } as ApiResponse);
      return;
    }

    const exhibition = db.prepare('SELECT * FROM exhibitions WHERE id = ?').get(id) as Exhibition | undefined;
    if (!exhibition) {
      res.status(404).json({ success: false, error: 'Exhibition not found' } as ApiResponse);
      return;
    }

    if (!exhibition.read_only && !exhibition.opening_confirmed) {
      res.status(400).json({ success: false, error: 'Anomaly can only be triggered after opening is confirmed' } as ApiResponse);
      return;
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE exhibitions SET anomaly_readonly = 1, anomaly_reason = ?, anomaly_at = ?, anomaly_by = ?, updated_at = ? WHERE id = ?`
    ).run(reason || '温湿度异常', now, triggered_by, now, id);

    const allTasks = db
      .prepare(`SELECT id FROM tasks WHERE exhibition_id = ?`)
      .all(id) as { id: string }[];
    for (const t of allTasks) {
      db.prepare(
        `INSERT INTO task_audit_logs (id, task_id, exhibition_id, log_type, old_value, new_value, reason, changed_by, created_at)
         VALUES (?, ?, ?, 'anomaly', 'normal', 'readonly', ?, ?, ?)`
      ).run(generateId('audit'), t.id, id, reason || '温湿度异常', triggered_by, now);
    }

    const updated = db.prepare('SELECT * FROM exhibitions WHERE id = ?').get(id) as Exhibition;
    res.json({
      success: true,
      data: updated,
      message: 'Anomaly triggered. Tasks switched to read-only, teardown plan preserved.',
    } as ApiResponse<Exhibition>);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to trigger anomaly',
    } as ApiResponse);
  }
});

router.post('/:id/resolve-anomaly', (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    const { resolved_by, reason } = req.body as { resolved_by?: string; reason?: string };

    if (!resolved_by) {
      res.status(400).json({ success: false, error: 'resolved_by is required' } as ApiResponse);
      return;
    }

    const exhibition = db.prepare('SELECT * FROM exhibitions WHERE id = ?').get(id) as Exhibition | undefined;
    if (!exhibition) {
      res.status(404).json({ success: false, error: 'Exhibition not found' } as ApiResponse);
      return;
    }

    if (!exhibition.anomaly_readonly) {
      res.status(400).json({ success: false, error: 'No active anomaly to resolve' } as ApiResponse);
      return;
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE exhibitions SET anomaly_readonly = 0, updated_at = ? WHERE id = ?`
    ).run(now, id);

    const updated = db.prepare('SELECT * FROM exhibitions WHERE id = ?').get(id) as Exhibition;
    res.json({
      success: true,
      data: updated,
      message: 'Anomaly resolved. Read-only lifted.',
    } as ApiResponse<Exhibition>);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to resolve anomaly',
    } as ApiResponse);
  }
});

router.put('/:id/teardown-responsible', (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    const { responsible_id, set_by } = req.body as { responsible_id?: string; set_by?: string };

    if (!set_by) {
      res.status(400).json({ success: false, error: 'set_by is required' } as ApiResponse);
      return;
    }

    const existing = db.prepare('SELECT id FROM exhibitions WHERE id = ?').get(id) as { id: string } | undefined;
    if (!existing) {
      res.status(404).json({ success: false, error: 'Exhibition not found' } as ApiResponse);
      return;
    }

    if (responsible_id) {
      const user = db.prepare('SELECT id FROM users WHERE id = ?').get(responsible_id) as { id: string } | undefined;
      if (!user) {
        res.status(400).json({ success: false, error: 'Invalid responsible user' } as ApiResponse);
        return;
      }
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE exhibitions SET teardown_responsible = ?, updated_at = ? WHERE id = ?`
    ).run(responsible_id || null, now, id);

    db.prepare(`UPDATE tasks SET phase = ? WHERE exhibition_id = ? AND category = 'exhibit_placement'`).run(
      'teardown',
      id
    );

    const updated = db.prepare('SELECT * FROM exhibitions WHERE id = ?').get(id) as Exhibition;
    res.json({
      success: true,
      data: updated,
      message: 'Teardown responsible assigned and tasks phase updated',
    } as ApiResponse<Exhibition>);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to set teardown responsible',
    } as ApiResponse);
  }
});

export default router;
