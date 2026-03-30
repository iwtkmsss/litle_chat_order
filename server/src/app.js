import cors from 'cors';
import express from 'express';

export function createApp({ clientUrl }) {
  const app = express();

  app.use(
    cors({
      origin: clientUrl,
      credentials: true,
    }),
  );
  app.use(express.json());

  app.get('/api/health', (_request, response) => {
    response.json({
      ok: true,
      message: 'Express API готов',
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}

