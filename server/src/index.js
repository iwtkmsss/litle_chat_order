import dotenv from 'dotenv';
import { createApp } from './app.js';

dotenv.config();

const port = Number(process.env.PORT) || 3001;
const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
const app = createApp({ clientUrl });

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
