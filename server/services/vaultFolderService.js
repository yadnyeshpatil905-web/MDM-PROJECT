import crypto from 'crypto';

class VaultFolderService {
  constructor() {
    this.files = [
      {
        id: 'file-001',
        name: 'Project_Titan_Vault_Passcodes.json',
        category: 'Confidential Credentials',
        size: '4.2 KB',
        updatedAt: '2026-11-17 18:30:00',
        mimeType: 'application/json',
        encrypted: true,
        content: JSON.stringify({
          system: "PPG Biometric Multi-Authenticator Vault",
          cluster_master_key: "k_sec_994a8b71d9319e0482ca0199f",
          database_replica: "postgres://admin:x99#aK2@db-cluster.internal:5432/biovault",
          backup_encryption_passphrase: "correct-horse-battery-staple-biometric-lock-2026",
          emergency_contact: "security-ops@biolock.internal"
        }, null, 2)
      },
      {
        id: 'file-002',
        name: 'Confidential_Biometric_Keys.pem',
        category: 'Cryptographic Keys',
        size: '1.8 KB',
        updatedAt: '2026-11-17 17:15:00',
        mimeType: 'text/plain',
        encrypted: true,
        content: `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA3f7T9wK2lJ4uVbQ1Y7M6vA...
[CLASSIFIED BIOMETRIC HARDWARE ROOT PRIVATE KEY]
Fingerprint & HW-827 PPG Morphological Signature Verifier Key
Checksum: 23917-EEPROM-ATMega328P
Issuer: PPG Biometric Authentication Authority
-----END RSA PRIVATE KEY-----`
      },
      {
        id: 'file-003',
        name: 'Executive_Financial_Report_Q4.pdf',
        category: 'Financial Documents',
        size: '1.2 MB',
        updatedAt: '2026-11-17 14:00:00',
        mimeType: 'application/pdf',
        encrypted: true,
        content: `CONFIDENTIAL EXECUTIVE BRIEFING • Q4 2026
Biometric Security Infrastructure Deployment Report:
- Total Secured Vault Locations: 14 Facilities
- Multi-Authenticator 2FA Adoption: 100% (Fingerprint + PIN)
- False Acceptance Rate (FAR): < 0.001%
- False Rejection Rate (FRR): < 0.8%
- Zero unauthorized breaches recorded under Two-Step Biometric + PIN policy.`
      },
      {
        id: 'file-004',
        name: 'HW827_Raw_Biometric_Telemetry.csv',
        category: 'Sensory Data',
        size: '28.5 KB',
        updatedAt: '2026-11-17 12:45:00',
        mimeType: 'text/csv',
        encrypted: true,
        content: `timestamp,adc_raw_pin_a0,filtered_ac,heart_beat,ibi_ms,match_score
1700000001,512,0,false,830,92
1700000002,525,13,false,830,92
1700000003,580,68,true,830,92
1700000004,540,28,false,830,92
1700000005,515,3,false,830,92`
      },
      {
        id: 'file-005',
        name: 'Emergency_Recovery_Passcodes.txt',
        category: 'Disaster Recovery',
        size: '890 B',
        updatedAt: '2026-11-17 09:00:00',
        mimeType: 'text/plain',
        encrypted: true,
        content: `CRITICAL DISASTER RECOVERY OVERRIDE CODES
--------------------------------------------------
Notice: Use of these one-time recovery codes triggers
immediate audible piezo alert and physical lockout audit.

Recovery Slot 1: 9942-8812-4401-7719 [ACTIVE]
Recovery Slot 2: 3310-9041-5512-8820 [ACTIVE]
Recovery Slot 3: 1104-5820-9941-2244 [ACTIVE]

Hardware Deadbolt Emergency Override: Dual-Key Manual Slot`
      }
    ];
  }

  getFiles() {
    return this.files.map(f => ({
      id: f.id,
      name: f.name,
      category: f.category,
      size: f.size,
      updatedAt: f.updatedAt,
      mimeType: f.mimeType,
      encrypted: f.encrypted
    }));
  }

  getFileById(id) {
    const file = this.files.find(f => f.id === id);
    if (!file) return null;
    return { ...file };
  }

  addFile({ name, category = 'General Secrets', content = '', mimeType = 'text/plain' }) {
    if (!name || !name.trim()) {
      throw new Error('File name is required');
    }
    const id = `file-${Date.now()}`;
    const newFile = {
      id,
      name: name.trim(),
      category: category.trim(),
      size: `${(Buffer.byteLength(content, 'utf8') / 1024).toFixed(1)} KB`,
      updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
      mimeType,
      encrypted: true,
      content: content || ''
    };
    this.files.unshift(newFile);
    return newFile;
  }

  deleteFile(id) {
    const idx = this.files.findIndex(f => f.id === id);
    if (idx === -1) return false;
    this.files.splice(idx, 1);
    return true;
  }
}

export const vaultFolderService = new VaultFolderService();
