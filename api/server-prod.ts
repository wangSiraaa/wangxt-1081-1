import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import fs from 'fs';
import authRoutes from './routes/auth.js';
import exhibitionRoutes from './routes/exhibitions.js';
import taskRoutes from './routes/tasks.js';
import exhibitRoutes from './routes/exhibits.js';
import { initDatabase } from './src/db/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

initDatabase();

const app: express.Application = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/exhibitions', exhibitionRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/exhibits', exhibitRoutes);

app.use(
  '/api/health',
  (req: Request, res: Response, next: NextFunction): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
    });
  },
);

const distDir = path.join(__dirname, '../dist');
if (fs.existsSync(distDir)) {
  console.log('[Gallery] Serving static files from', distDir);
  app.use(express.static(distDir, { maxAge: '1h' }));

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api/')) return next();
    const index = path.join(distDir, 'index.html');
    if (fs.existsSync(index)) {
      res.sendFile(index);
    } else {
      next();
    }
  });
} else {
  console.log('[Gallery] No static dist directory found, API-only mode');
}

app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('[Gallery Server Error]', error);
  res.status(500).json({
    success: false,
    error: 'Server internal error',
  });
});

app.use((req: Request, res: Response) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ success: false, error: 'API not found' });
  } else {
    res.status(404).send('Not Found');
  }
});

const PORT = Number(process.env.APP_PORT || process.env.PORT || 18381);

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n========================================`);
  console.log(`  美术馆布展任务系统已启动`);
  console.log(`  Web:  http://localhost:${PORT}`);
  console.log(`  API:  http://localhost:${PORT}/api/health`);
  console.log(`========================================\n`);
});

process.on('SIGTERM', () => {
  console.log('[Gallery] SIGTERM received');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('[Gallery] SIGINT received');
  server.close(() => process.exit(0));
});

export default app;
