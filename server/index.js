import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import apiRouter from './routes/api.js';
import { deviceService } from './services/deviceService.js';
import { authService } from './services/authService.js';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json({ limit: '2mb' }));


// Mount Modular API Router
app.use('/api', apiRouter);

// Healthcheck endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

const PORT = process.env.PORT || 5000;

// Device state change broadcast over Socket.IO
deviceService.onStateChange((state) => {
  io.emit('deviceState', state);
});

// Socket.IO Realtime connection handler
io.on('connection', (socket) => {
  // Send current hardware & system state upon connection
  socket.emit('deviceState', deviceService.getDeviceState());
  socket.emit('securitySettings', authService.getConfig());

  socket.on('startScan', (data) => {
    io.emit('scanStarted', { timestamp: Date.now(), ...data });
  });

  socket.on('stopScan', () => {
    io.emit('scanStopped', { timestamp: Date.now() });
  });

  socket.on('clientTelemetry', (telemetry) => {
    // Forward client-acquired telemetry if genuine hardware is attached to browser
    socket.broadcast.emit('liveWaveSample', telemetry);
  });

  socket.on('disconnect', () => {
    // client disconnected
  });
});

const isTest = process.env.NODE_ENV === 'test' || process.argv.some(a => a.includes('test'));

if (!isTest) {
  server.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`PPG Biometric Lock Backend running on port ${PORT}`);
    console.log(`Supabase-Ready Repository & Two-Step Auth Online`);
    console.log(`===================================================`);
  });
}

export { app, server, io };
