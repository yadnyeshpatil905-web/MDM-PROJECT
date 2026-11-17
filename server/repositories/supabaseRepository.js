import { getSupabaseClient } from '../services/supabaseClient.js';
import { CryptoService } from '../services/cryptoService.js';
import { 
  BIOMETRIC_RESULTS, 
  PIN_RESULTS, 
  FINAL_RESULTS, 
  VAULT_EVENT_TYPES, 
  DEVICE_STATUS,
  CREDENTIAL_STATUS 
} from '../models/constants.js';

export class SupabaseRepositoryManager {
  getClient() {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error('Supabase client is not configured. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    }
    return client;
  }

  // --- Profiles ---
  async createProfile({ id, full_name, email, password }) {
    const client = this.getClient();
    let profileId = id || CryptoService.generateId();

    // If password is provided and admin API is available (with service_role key),
    // create the user in Supabase auth.users so foreign key constraint references pass
    if (password && client.auth?.admin) {
      try {
        const { data: authUser, error: authErr } = await client.auth.admin.createUser({
          email: email.toLowerCase().trim(),
          password: password,
          email_confirm: true,
          user_metadata: { full_name: full_name.trim() }
        });
        if (!authErr && authUser?.user?.id) {
          profileId = authUser.user.id;
        } else if (authErr && (authErr.message?.toLowerCase().includes('already') || authErr.message?.toLowerCase().includes('exists'))) {
          const { data: userList } = await client.auth.admin.listUsers();
          const found = userList?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase().trim());
          if (found) profileId = found.id;
        }
      } catch (err) {
        console.warn('[SupabaseRepository] auth.admin note:', err.message);
      }
    }

    const { data, error } = await client
      .from('profiles')
      .upsert({
        id: profileId,
        full_name: full_name.trim(),
        email: email.toLowerCase().trim()
      }, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw new Error(`Supabase createProfile failed: ${error.message}`);
    return data;
  }

  async findProfileById(id) {
    const client = this.getClient();
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`Supabase findProfileById failed: ${error.message}`);
    return data;
  }

  async findProfileByEmail(email) {
    const client = this.getClient();
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (error) throw new Error(`Supabase findProfileByEmail failed: ${error.message}`);
    return data;
  }

  async listProfiles() {
    const client = this.getClient();
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Supabase listProfiles failed: ${error.message}`);
    return data || [];
  }

  // --- Biometric Credentials ---
  async createBiometricCredential({ user_id, template_data, template_version = 'v1.0-morphology-20', status = CREDENTIAL_STATUS.ACTIVE }) {
    const client = this.getClient();
    const { data, error } = await client
      .from('biometric_credentials')
      .upsert({
        user_id,
        template_data,
        template_version,
        status,
        enrolled_at: new Date().toISOString()
      }, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) throw new Error(`Supabase createBiometricCredential failed: ${error.message}`);
    return data;
  }

  async findBiometricCredentialByUserId(user_id) {
    const client = this.getClient();
    const { data, error } = await client
      .from('biometric_credentials')
      .select('*')
      .eq('user_id', user_id)
      .eq('status', CREDENTIAL_STATUS.ACTIVE)
      .maybeSingle();

    if (error) throw new Error(`Supabase findBiometricCredential failed: ${error.message}`);
    return data;
  }

  async revokeBiometricCredential(id) {
    const client = this.getClient();
    const { error } = await client
      .from('biometric_credentials')
      .update({ status: CREDENTIAL_STATUS.REVOKED })
      .eq('id', id);

    if (error) throw new Error(`Supabase revokeBiometricCredential failed: ${error.message}`);
    return true;
  }

  // --- Vault Credentials ---
  async createVaultCredential({ user_id, pin_hash }) {
    const client = this.getClient();
    const { data, error } = await client
      .from('vault_credentials')
      .upsert({
        user_id,
        pin_hash,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) throw new Error(`Supabase createVaultCredential failed: ${error.message}`);
    return data;
  }

  async findVaultCredentialByUserId(user_id) {
    const client = this.getClient();
    const { data, error } = await client
      .from('vault_credentials')
      .select('*')
      .eq('user_id', user_id)
      .maybeSingle();

    if (error) throw new Error(`Supabase findVaultCredential failed: ${error.message}`);
    return data;
  }

  async updatePinHash(user_id, pin_hash) {
    return this.createVaultCredential({ user_id, pin_hash });
  }

  // --- Authentication Attempts ---
  async createAuthAttempt({ user_id, biometric_result, pin_result, final_result, failure_reason = null }) {
    const client = this.getClient();
    const { data, error } = await client
      .from('authentication_attempts')
      .insert({
        user_id: user_id || null,
        biometric_result,
        pin_result,
        final_result,
        failure_reason
      })
      .select()
      .single();

    if (error) throw new Error(`Supabase createAuthAttempt failed: ${error.message}`);
    return data;
  }

  async listAuthAttempts({ limit = 50, offset = 0 } = {}) {
    const client = this.getClient();
    const { data, error } = await client
      .from('authentication_attempts')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`Supabase listAuthAttempts failed: ${error.message}`);
    return data || [];
  }

  async countRecentFailedPinAttempts(user_id, windowSeconds = 300) {
    const client = this.getClient();
    const cutoff = new Date(Date.now() - windowSeconds * 1000).toISOString();
    const { count, error } = await client
      .from('authentication_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user_id)
      .eq('pin_result', PIN_RESULTS.FAILURE)
      .gte('created_at', cutoff);

    if (error) throw new Error(`Supabase countRecentFailedPinAttempts failed: ${error.message}`);
    return count || 0;
  }

  // --- Vault Events ---
  async createVaultEvent({ user_id, event_type }) {
    const client = this.getClient();
    const { data, error } = await client
      .from('vault_events')
      .insert({
        user_id: user_id || null,
        event_type
      })
      .select()
      .single();

    if (error) throw new Error(`Supabase createVaultEvent failed: ${error.message}`);
    return data;
  }

  async listVaultEvents({ limit = 50, offset = 0 } = {}) {
    const client = this.getClient();
    const { data, error } = await client
      .from('vault_events')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`Supabase listVaultEvents failed: ${error.message}`);
    return data || [];
  }

  // --- Devices ---
  async upsertDevice({ id, user_id, device_name, connection_status }) {
    const client = this.getClient();
    const now = new Date().toISOString();
    const { data, error } = await client
      .from('devices')
      .upsert({
        id: id || CryptoService.generateId(),
        user_id,
        device_name: device_name || 'ARDUINO-UNO-01',
        connection_status: connection_status || DEVICE_STATUS.DISCONNECTED,
        last_seen_at: now
      })
      .select()
      .single();

    if (error) throw new Error(`Supabase upsertDevice failed: ${error.message}`);
    return data;
  }

  async listDevices() {
    const client = this.getClient();
    const { data, error } = await client
      .from('devices')
      .select('*');

    if (error) throw new Error(`Supabase listDevices failed: ${error.message}`);
    return data || [];
  }

  // --- Biometric Recordings (public.biometric_recordings) ---
  async createBiometricRecording({ id, user_id, pulse_samples, raw_samples, red_samples, ir_samples, sample_rate, sample_count, device_info = 'HW-827 Pulse Sensor', recorded_at }) {
    const client = this.getClient();
    const primary = pulse_samples || raw_samples || red_samples || [];
    const { data, error } = await client
      .from('biometric_recordings')
      .insert({
        id: id || CryptoService.generateId(),
        user_id,
        red_samples: red_samples || primary,
        ir_samples: ir_samples || primary,
        sample_rate: Number(sample_rate),
        sample_count: Number(sample_count),
        device_info: device_info || 'HW-827 Pulse Sensor',
        recorded_at: recorded_at || new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw new Error(`Supabase createBiometricRecording failed: ${error.message}`);
    return data;
  }

  async listBiometricRecordingsByUserId(user_id, { limit = 50, offset = 0 } = {}) {
    const client = this.getClient();
    const { data, error } = await client
      .from('biometric_recordings')
      .select('*')
      .eq('user_id', user_id)
      .order('recorded_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`Supabase listBiometricRecordings failed: ${error.message}`);
    return data || [];
  }

  async findBiometricRecordingById(id) {
    const client = this.getClient();
    const { data, error } = await client
      .from('biometric_recordings')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`Supabase findBiometricRecordingById failed: ${error.message}`);
    return data;
  }

  async countBiometricRecordingsByUserId(user_id) {
    const client = this.getClient();
    const { count, error } = await client
      .from('biometric_recordings')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user_id);

    if (error) throw new Error(`Supabase countBiometricRecordings failed: ${error.message}`);
    return count || 0;
  }
}

export const supabaseRepository = new SupabaseRepositoryManager();
