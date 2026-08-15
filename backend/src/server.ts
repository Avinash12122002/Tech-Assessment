import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer } from 'ws';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { config, validateConfig } from './config';
import { createSession, getSession } from './handlers/session.handler';
import { handleWebSocketConnection } from './handlers/websocket.handler';

// Validate environment variables before starting
validateConfig();

const app = express();
const server = http.createServer(app);

// ===== Middleware =====

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    
    // If frontendUrl is '*', allow all
    if (config.frontendUrl === '*' || config.frontendUrl === '') {
      return callback(null, true);
    }

    const allowedOrigins = config.frontendUrl.split(',').map((o) => o.trim());
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*') || origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    
    // Allow Render / Vercel preview domains if applicable
    return callback(null, true);
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));

// Rate limiting for REST endpoints
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// ===== REST Endpoints =====

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Create a new session
app.post('/api/session', (_req, res) => {
  try {
    const session = createSession();
    res.json({ sessionId: session.id });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Get session report (for fallback if WebSocket missed it)
app.get('/api/session/:id/report', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  if (session.status !== 'ended') {
    res.status(400).json({ error: 'Session has not ended yet' });
    return;
  }
  // Report is generated via WebSocket, but we can regenerate if needed
  res.json({ sessionId: session.id, status: session.status });
});

// ===== Serve Frontend (Production) =====

const frontendPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendPath));

// SPA fallback — serve index.html for any non-API route
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(frontendPath, 'index.html'), (err) => {
      if (err) {
        res.status(404).json({ error: 'Frontend not built. Run: cd frontend && npm run build' });
      }
    });
  }
});

// ===== WebSocket Server =====

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  handleWebSocketConnection(ws);
});

// Heartbeat to keep connections alive
const HEARTBEAT_INTERVAL = 30000;
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.readyState === ws.OPEN) {
      ws.ping();
    }
  });
}, HEARTBEAT_INTERVAL);

// ===== Start Server =====

server.listen(config.port, () => {
  console.log(`\n🏥 Health Screening AI Server`);
  console.log(`   REST API:   http://localhost:${config.port}/api/health`);
  console.log(`   WebSocket:  ws://localhost:${config.port}/ws`);
  console.log(`   Frontend:   ${config.frontendUrl}`);
  console.log(`   Environment: ${config.nodeEnv}\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  wss.close();
  server.close();
  process.exit(0);
});
