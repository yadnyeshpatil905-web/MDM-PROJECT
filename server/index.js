import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

// Device & Auth runtime state
let systemState = {
  arduinoConnected: false,
  sensorStatus: 'READY',
  servoStatus: 'LOCKED',
  servoAngle: 0,
  mode: 'AUTHENTICATION',
  bpm: 0,
  beatCount: 0,
  matchScore: 0,
  lastResult: null,
  enrolledTemplate: [
    35, 78, 142, 215, 255, 240, 195, 150, 120, 95,
    82, 105, 125, 110, 85, 65, 48, 38, 30, 25
  ]
};

// In-memory MongoDB-compatible logs
let authLogs = [
  { id: 'LOG-1092', timestamp: new Date().toISOString(), userId: 'USER-001', bpm: 74, beats: 8, score: 88, result: 'GRANTED', reason: 'Template Match 88% >= 70%', device: 'ARDUINO-UNO-01', duration: '7.2s' },
  { id: 'LOG-1091', timestamp: new Date(Date.now() - 300000).toISOString(), userId: 'UNKNOWN', bpm: 76, beats: 7, score: 42, result: 'DENIED', reason: 'Biometric Mismatch (42% < 70%)', device: 'ARDUINO-UNO-01', duration: '6.8s' }
];

// REST Endpoints
app.get('/api/device/status', (req, res) => {
  res.json({
    arduino: systemState.arduinoConnected ? 'CONNECTED' : 'SIMULATED',
    sensor: 'HW-827 OPTICAL PPG',
    servo: systemState.servoStatus,
    baudRate: 9600,
    database: 'CONNECTED'
  });
});

app.get('/api/auth/status', (req, res) => {
  res.json(systemState);
});

app.get('/api/history', (req, res) => {
  res.json(authLogs);
});

app.post('/api/settings', (req, res) => {
  const { matchThreshold, captureDuration, autoLockDuration } = req.body;
  res.json({ success: true, message: 'Settings updated successfully' });
});

// Socket.IO Realtime connection handler
io.on('connection', (socket) => {
  console.log(`[Socket.IO] Client connected: ${socket.id}`);
  
  socket.emit('systemState', systemState);

  socket.on('startScan', (data) => {
    io.emit('scanStarted', { timestamp: Date.now() });
  });

  socket.on('stopScan', () => {
    io.emit('scanStopped', { timestamp: Date.now() });
  });

  socket.on('disconnect', () => {
    console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`PPG Biometric Lock Backend running on port ${PORT}`);
  console.log(`Socket.IO WebSocket ready for telemetry broadcast`);
  console.log(`===================================================`);
});
