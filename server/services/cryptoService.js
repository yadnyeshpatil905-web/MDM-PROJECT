import crypto from 'crypto';

/**
 * Cryptographic security service for salted PIN hashing, constant-time verification,
 * and high-entropy challenge token generation.
 * 
 * Never logs or stores raw PINs or secrets.
 */
export class CryptoService {
  /**
   * Hashes a numeric vault PIN using Scrypt with a unique 16-byte salt.
   * Format: scrypt$<salt_hex>$<derived_key_hex>
   */
  static hashPin(pin) {
    if (!pin || typeof pin !== 'string') {
      throw new Error('PIN must be a valid string');
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(pin, salt, 64).toString('hex');
    return `scrypt$${salt}$${derivedKey}`;
  }

  /**
   * Verifies an entered PIN against a stored salted hash in constant time
   * to protect against timing attacks.
   */
  static verifyPin(enteredPin, storedHash) {
    if (!enteredPin || !storedHash || typeof enteredPin !== 'string') {
      return false;
    }
    try {
      const parts = storedHash.split('$');
      if (parts.length !== 3 || parts[0] !== 'scrypt') {
        return false;
      }
      const salt = parts[1];
      const originalKey = Buffer.from(parts[2], 'hex');
      const testKey = crypto.scryptSync(enteredPin, salt, 64);
      
      if (originalKey.length !== testKey.length) {
        return false;
      }
      return crypto.timingSafeEqual(originalKey, testKey);
    } catch (err) {
      return false;
    }
  }

  /**
   * Generates a cryptographically random UUID v4.
   */
  static generateId() {
    return crypto.randomUUID();
  }

  /**
   * Generates an unguessable 256-bit challenge token with short TTL.
   */
  static generateChallengeToken() {
    return crypto.randomBytes(32).toString('hex');
  }
}
