import { DEFAULT_CONFIG, VAULT_EVENT_TYPES, DEVICE_STATUS } from '../models/constants.js';
import { repository } from '../repositories/inMemoryRepository.js';

export class DeviceService {
  constructor() {
    this.connectionStatus = DEVICE_STATUS.SIMULATED;
    this.servoAngle = 0; // 0 = Locked, 90 = Unlocked
    this.sensorStatus = 'READY';
    this.lastCommunication = new Date().toISOString();
    this.autoLockTimer = null;
    this.baudRate = 9600;
    this.serialPortInstance = null;
    this.onStateChangeCallbacks = [];
  }

  onStateChange(cb) {
    this.onStateChangeCallbacks.push(cb);
  }

  notifyStateChange() {
    this.onStateChangeCallbacks.forEach(cb => {
      try { cb(this.getDeviceState()); } catch (e) { /* ignore */ }
    });
  }

  getDeviceState() {
    return {
      connectionStatus: this.connectionStatus,
      servoAngle: this.servoAngle,
      servoStatus: this.servoAngle >= 45 ? 'UNLOCKED' : 'LOCKED',
      sensorStatus: this.sensorStatus,
      lastCommunication: this.lastCommunication,
      baudRate: this.baudRate,
      isFailClosed: true
    };
  }

  /**
   * Only trusted backend authorization flow can invoke unlock!
   * Opens servo to 90 degrees and schedules automatic safe relock.
   */
  async executeAuthorizedUnlock(userId) {
    if (this.autoLockTimer) {
      clearTimeout(this.autoLockTimer);
      this.autoLockTimer = null;
    }

    this.servoAngle = 90;
    this.lastCommunication = new Date().toISOString();
    this.notifyStateChange();

    await repository.createVaultEvent({
      user_id: userId,
      event_type: VAULT_EVENT_TYPES.OPEN_AUTHORIZED
    });

    // Schedule fail-safe automatic relock
    this.autoLockTimer = setTimeout(async () => {
      await this.executeRelock(userId);
    }, DEFAULT_CONFIG.AUTO_LOCK_DURATION_SEC * 1000);

    return {
      success: true,
      servoAngle: 90,
      autoLockInSeconds: DEFAULT_CONFIG.AUTO_LOCK_DURATION_SEC
    };
  }

  /**
   * Forces servo to 0 degrees (LOCKED).
   */
  async executeRelock(userId = null) {
    if (this.autoLockTimer) {
      clearTimeout(this.autoLockTimer);
      this.autoLockTimer = null;
    }

    this.servoAngle = 0;
    this.lastCommunication = new Date().toISOString();
    this.notifyStateChange();

    if (userId) {
      await repository.createVaultEvent({
        user_id: userId,
        event_type: VAULT_EVENT_TYPES.CLOSED
      });
    }

    return {
      success: true,
      servoAngle: 0,
      status: 'LOCKED'
    };
  }

  setConnectionStatus(status) {
    this.connectionStatus = status;
    this.lastCommunication = new Date().toISOString();
    this.notifyStateChange();
  }
}

export const deviceService = new DeviceService();
