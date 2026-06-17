import { Router, type Request, type Response } from 'express';
import db from '../src/db/index.js';
import type { User, ApiResponse } from '../../shared/types.js';

const router = Router();

router.get('/users', (req: Request, res: Response): void => {
  try {
    const users = db.prepare('SELECT * FROM users ORDER BY created_at').all() as User[];
    res.json({ success: true, data: users } as ApiResponse<User[]>);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch users',
    } as ApiResponse);
  }
});

router.post('/login', (req: Request, res: Response): void => {
  try {
    const { username } = req.body as { username?: string };
    if (!username) {
      res.status(400).json({ success: false, error: 'Username is required' } as ApiResponse);
      return;
    }

    const user = db
      .prepare('SELECT * FROM users WHERE username = ?')
      .get(username) as User | undefined;

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' } as ApiResponse);
      return;
    }

    res.json({ success: true, data: user, message: 'Login successful' } as ApiResponse<User>);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Login failed',
    } as ApiResponse);
  }
});

export default router;
