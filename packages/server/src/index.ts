import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import express from 'express';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@catan-online/shared';
import { RoomManager } from './rooms/RoomManager.js';
import { registerHandlers } from './socket/registerHandlers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
const isProduction = process.env.NODE_ENV === 'production';

const app = express();
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: isProduction ? undefined : { origin: '*' },
});

app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true });
});

if (isProduction) {
  // client is built separately and served from the same origin, so Socket.io needs no CORS config
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const roomManager = new RoomManager();

io.on('connection', (socket) => {
  registerHandlers(io, socket, roomManager);
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`kaitaku-game server listening on port ${PORT} (${isProduction ? 'production' : 'development'})`);
});
