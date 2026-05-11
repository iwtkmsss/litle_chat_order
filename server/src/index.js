import 'dotenv/config';
import { createApp } from './app.js';

const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST || undefined;
const clientUrl = (process.env.CLIENT_ORIGIN || process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const app = createApp({ clientUrl });

app.listen(port, host, () => {
  const displayHost = host && host !== '0.0.0.0' ? host : 'localhost';
  console.log(`Server listening on http://${displayHost}:${port}`);
});
