import app from './app.js';

const PORT = Number(process.env.API_PORT || process.env.PORT || 19381);

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Gallery API] Server ready on http://0.0.0.0:${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('[Gallery API] SIGTERM received');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('[Gallery API] SIGINT received');
  server.close(() => process.exit(0));
});

export default app;
