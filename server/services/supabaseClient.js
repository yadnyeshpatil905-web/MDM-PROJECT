import { createClient } from '@supabase/supabase-js';

let cachedClient = null;

/**
 * Single source of truth for backend Supabase connection.
 * Uses privileged service_role key to manage private biometric records.
 * NEVER exposed to frontend clients.
 */
export function getSupabaseClient() {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  cachedClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  return cachedClient;
}

export function isSupabaseConfigured() {
  if (process.env.NODE_ENV === 'test') return false;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  return Boolean(url && key);
}

/**
 * Validates a Supabase JWT access token on the trusted backend
 * to authenticate identity without trusting client parameters.
 */
export async function verifySupabaseToken(token) {
  const client = getSupabaseClient();
  if (!client) {
    return null;
  }

  try {
    const { data: { user }, error } = await client.auth.getUser(token);
    if (error || !user) {
      return null;
    }
    return user;
  } catch (err) {
    console.warn('[SupabaseAuth] Token validation error:', err.message);
    return null;
  }
}
