import { Router, type Request, type Response } from 'express';
import db from '../src/db/index.js';
import type { Exhibit, ApiResponse, TaskAuditLog } from '../../shared/types.js';

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

function insertAuditLogForExhibit(
  exhibitionId: string,
  exhibitId: string,
  logType: string,
  oldValue: string | null,
  newValue: string | null,
  reason: string | null,
  changedBy: string
): void {
  const now = new Date().toISOString();
  const dummyTaskId = `exhibit_${exhibitId}`;
  db.prepare(
    `INSERT INTO task_audit_logs (id, task_id, exhibition_id, log_type, old_value, new_value, reason, changed_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(generateId('audit'), dummyTaskId, exhibitionId, logType, oldValue, newValue, reason, changedBy, now);
}

router.get('/', (req: Request, res: Response): void => {
  try {
    const { exhibition_id } = req.query;
    let query = 'SELECT * FROM exhibits';
    const params: unknown[] = [];
    if (exhibition_id) {
      query += ' WHERE exhibition_id = ?';
      params.push(exhibition_id);
    }
    query += ' ORDER BY created_at';
    const exhibits = db.prepare(query).all(...params) as Exhibit[];
    res.json({ success: true, data: exhibits } as ApiResponse<Exhibit[]>);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch exhibits',
    } as ApiResponse);
  }
});

router.get('/:id', (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    const exhibit = db.prepare('SELECT * FROM exhibits WHERE id = ?').get(id) as Exhibit | undefined;
    if (!exhibit) {
      res.status(404).json({ success: false, error: 'Exhibit not found' } as ApiResponse);
      return;
    }
    res.json({ success: true, data: exhibit } as ApiResponse<Exhibit>);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch exhibit',
    } as ApiResponse);
  }
});

router.post('/', (req: Request, res: Response): void => {
  try {
    const {
      exhibition_id,
      name,
      artist,
      year,
      is_key_exhibit,
      needs_thermostat,
      placement_task_id,
      position,
    } = req.body as Partial<Exhibit>;

    if (!exhibition_id || !name) {
      res.status(400).json({ success: false, error: 'exhibition_id and name are required' } as ApiResponse);
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

    const id = generateId('exhbt');
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO exhibits (id, exhibition_id, name, artist, year, is_key_exhibit, needs_thermostat,
       thermostat_confirmed, restoration_confirmed, placement_task_id, status, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 'not_arrived', ?, ?, ?)`
    ).run(
      id,
      exhibition_id,
      name,
      artist || null,
      year || null,
      is_key_exhibit ? 1 : 0,
      needs_thermostat ? 1 : 0,
      placement_task_id || null,
      position || null,
      now,
      now
    );

    insertAuditLogForExhibit(exhibition_id, id, 'review', null, 'created', `Exhibit created: ${name}`, created_by || 'system');

    const exhibit = db.prepare('SELECT * FROM exhibits WHERE id = ?').get(id) as Exhibit;
    res.json({ success: true, data: exhibit, message: 'Exhibit created' } as ApiResponse<Exhibit>);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create exhibit',
    } as ApiResponse);
  }
});

router.put('/:id', (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    const {
      name,
      artist,
      year,
      is_key_exhibit,
      needs_thermostat,
      placement_task_id,
      status,
      position,
    } = req.body as Partial<Exhibit>;

    const existing = db
      .prepare('SELECT id, exhibition_id FROM exhibits WHERE id = ?')
      .get(id) as { id: string; exhibition_id: string } | undefined;
    if (!existing) {
      res.status(404).json({ success: false, error: 'Exhibit not found' } as ApiResponse);
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
    db.prepare(
      `UPDATE exhibits SET name = COALESCE(?, name), artist = ?, year = ?,
       is_key_exhibit = COALESCE(?, is_key_exhibit), needs_thermostat = COALESCE(?, needs_thermostat),
       restoration_confirmed = COALESCE(?, restoration_confirmed),
       placement_task_id = ?, status = COALESCE(?, status), position = ?, updated_at = ? WHERE id = ?`
    ).run(
      name ?? null,
      artist ?? null,
      year ?? null,
      is_key_exhibit !== undefined ? (is_key_exhibit ? 1 : 0) : null,
      needs_thermostat !== undefined ? (needs_thermostat ? 1 : 0) : null,
      undefined,
      placement_task_id ?? null,
      status ?? null,
      position ?? null,
      now,
      id
    );

    insertAuditLogForExhibit(
      existing.exhibition_id,
      id,
      'review',
      null,
      'updated',
      `Exhibit info updated`,
      confirmed_by || 'system'
    );

    const exhibit = db.prepare('SELECT * FROM exhibits WHERE id = ?').get(id) as Exhibit;
    res.json({ success: true, data: exhibit, message: 'Exhibit updated' } as ApiResponse<Exhibit>);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update exhibit',
    } as ApiResponse);
  }
});

router.post('/:id/confirm-thermostat', (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    const { confirmed_by } = req.body as { confirmed_by?: string };

    if (!confirmed_by) {
      res.status(400).json({ success: false, error: 'confirmed_by is required' } as ApiResponse);
      return;
    }

    const exhibit = db.prepare('SELECT * FROM exhibits WHERE id = ?').get(id) as Exhibit | undefined;
    if (!exhibit) {
      res.status(404).json({ success: false, error: 'Exhibit not found' } as ApiResponse);
      return;
    }

    if (isEffectivelyReadOnly(exhibit.exhibition_id)) {
      const s = isExhibitionReadOnly(exhibit.exhibition_id);
      const msg = s.anomalyReadOnly
        ? `Exhibition is read-only due to anomaly: ${s.reason || 'unknown'}`
        : 'Exhibition is read-only after opening';
      res.status(403).json({ success: false, error: msg } as ApiResponse);
      return;
    }

    if (!exhibit.needs_thermostat) {
      res.status(400).json({ success: false, error: 'This exhibit does not need a thermostat' } as ApiResponse);
      return;
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE exhibits SET thermostat_confirmed = 1, thermostat_confirmed_at = ?, thermostat_confirmed_by = ?, updated_at = ? WHERE id = ?`
    ).run(now, confirmed_by, now, id);

    insertAuditLogForExhibit(
      exhibit.exhibition_id,
      id,
      'review',
      'thermostat:false',
      'thermostat:true',
      `Thermostat confirmed by ${confirmed_by}`,
      confirmed_by
    );

    const updated = db.prepare('SELECT * FROM exhibits WHERE id = ?').get(id) as Exhibit;
    res.json({
      success: true,
      data: updated,
      message: 'Thermostat confirmed for exhibit',
    } as ApiResponse<Exhibit>);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to confirm thermostat',
    } as ApiResponse);
  }
});

router.post('/:id/confirm-restoration', (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    const { confirmed_by, reason } = req.body as { confirmed_by?: string; reason?: string };

    if (!confirmed_by) {
      res.status(400).json({ success: false, error: 'confirmed_by is required' } as ApiResponse);
      return;
    }

    const exhibit = db.prepare('SELECT * FROM exhibits WHERE id = ?').get(id) as Exhibit | undefined;
    if (!exhibit) {
      res.status(404).json({ success: false, error: 'Exhibit not found' } as ApiResponse);
      return;
    }

    if (isEffectivelyReadOnly(exhibit.exhibition_id)) {
      const s = isExhibitionReadOnly(exhibit.exhibition_id);
      const msg = s.anomalyReadOnly
        ? `Exhibition is read-only due to anomaly: ${s.reason || 'unknown'}`
        : 'Exhibition is read-only after opening';
      res.status(403).json({ success: false, error: msg } as ApiResponse);
      return;
    }

    if (!exhibit.is_key_exhibit) {
      // Still allowed for non-key exhibits too
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE exhibits SET restoration_confirmed = 1, restoration_confirmed_at = ?, restoration_confirmed_by = ?, updated_at = ? WHERE id = ?`
    ).run(now, confirmed_by, now, id);

    insertAuditLogForExhibit(
      exhibit.exhibition_id,
      id,
      'review',
      'restoration:false',
      'restoration:true',
      reason || `Restoration confirmed by ${confirmed_by}`,
      confirmed_by
    );

    const updated = db.prepare('SELECT * FROM exhibits WHERE id = ?').get(id) as Exhibit;
    res.json({
      success: true,
      data: updated,
      message: 'Restoration confirmed for exhibit',
    } as ApiResponse<Exhibit>);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to confirm restoration',
    } as ApiResponse);
  }
});

export default router;
