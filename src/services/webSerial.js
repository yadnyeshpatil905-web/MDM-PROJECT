// Direct Browser-to-Arduino USB Serial Driver using W3C Web Serial API

export class WebSerialDriver {
  constructor(onLineReceived, onStatusChange) {
    this.port = null;
    this.reader = null;
    this.readableStreamClosed = null;
    this.isConnected = false;
    this.onLineReceived = onLineReceived || (() => {});
    this.onStatusChange = onStatusChange || (() => {});
    this.baudRate = 9600;
    this.lineBuffer = '';
    this.portInfo = null;
  }

  isSupported() {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  async connect(baudRate = 9600) {
    if (!this.isSupported()) {
      throw new Error('Web Serial API is not supported in this browser. Please use Chrome, Edge, or Opera.');
    }

    try {
      this.baudRate = baudRate;
      // Request USB serial port from user
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: this.baudRate });

      this.isConnected = true;
      const info = this.port.getInfo ? this.port.getInfo() : {};
      this.portInfo = info;
      this.onStatusChange({ 
        connected: true, 
        message: `Connected to Arduino UNO (${this.baudRate} Baud)`,
        portInfo: info
      });

      this.readLoop();
      return true;
    } catch (err) {
      this.isConnected = false;
      this.onStatusChange({ 
        connected: false, 
        message: `Connection failed: ${err.message}` 
      });
      throw err;
    }
  }

  async readLoop() {
    const textDecoder = new TextDecoderStream();
    this.readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
    this.reader = textDecoder.readable.getReader();

    try {
      while (true) {
        const { value, done } = await this.reader.read();
        if (done) {
          break;
        }
        if (value) {
          this.handleIncomingChunk(value);
        }
      }
    } catch (error) {
      console.warn('WebSerial read error:', error);
    } finally {
      this.reader.releaseLock();
    }
  }

  handleIncomingChunk(chunk) {
    this.lineBuffer += chunk;
    const lines = this.lineBuffer.split(/\r?\n/);
    // Keep last incomplete segment in buffer
    this.lineBuffer = lines.pop();

    for (const line of lines) {
      if (line.trim().length > 0) {
        this.onLineReceived(line.trim());
      }
    }
  }

  async writeLine(text) {
    if (!this.isConnected || !this.port || !this.port.writable) return;
    const encoder = new TextEncoder();
    const writer = this.port.writable.getWriter();
    await writer.write(encoder.encode(text + '\n'));
    writer.releaseLock();
  }

  async disconnect() {
    if (this.reader) {
      await this.reader.cancel();
      await this.readableStreamClosed.catch(() => {});
      this.reader = null;
    }
    if (this.port) {
      await this.port.close();
      this.port = null;
    }
    this.isConnected = false;
    this.onStatusChange({ connected: false, message: 'Disconnected from Arduino' });
  }
}
