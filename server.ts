import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // API route for secure TURN credentials (Metered TURN)
  const getIceServers = () => {
    const TURN_USERNAME = process.env.TURN_USERNAME || '';
    const TURN_PASSWORD = process.env.TURN_PASSWORD || '';
    return [
      { urls: "stun:stun.relay.metered.ca:80" },
      { urls: "turn:global.relay.metered.ca:80", username: TURN_USERNAME, credential: TURN_PASSWORD },
      { urls: "turn:global.relay.metered.ca:80?transport=tcp", username: TURN_USERNAME, credential: TURN_PASSWORD },
      { urls: "turn:global.relay.metered.ca:443", username: TURN_USERNAME, credential: TURN_PASSWORD },
      { urls: "turns:global.relay.metered.ca:443?transport=tcp", username: TURN_USERNAME, credential: TURN_PASSWORD }
    ];
  };

  app.get('/api/ice-servers', (req, res) => {
    res.json({ iceServers: getIceServers() });
  });

  app.get('/api/turn-credentials', (req, res) => {
    res.json({ iceServers: getIceServers() });
  });

  // Create Vite server in middleware mode
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });

  app.use(vite.middlewares);

  app.listen(PORT, '0.0.0.0', () => {
    console.info(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
