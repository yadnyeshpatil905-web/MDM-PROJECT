import { repository as inMemoryRepo, InMemoryRepositoryManager } from './inMemoryRepository.js';
import { supabaseRepository, SupabaseRepositoryManager } from './supabaseRepository.js';
import { isSupabaseConfigured } from '../services/supabaseClient.js';

/**
 * Returns active repository based on configuration.
 * Uses real Supabase PostgreSQL if SUPABASE_URL and credentials are provided,
 * otherwise transparently falls back to InMemoryRepositoryManager.
 */
export function getActiveRepository() {
  if (process.env.NODE_ENV === 'test') {
    return inMemoryRepo;
  }
  if (isSupabaseConfigured()) {
    return supabaseRepository;
  }
  return inMemoryRepo;
}

export const repository = new Proxy({}, {
  get(target, prop) {
    const active = getActiveRepository();
    const val = active[prop];
    if (typeof val === 'function') {
      return val.bind(active);
    }
    return val;
  }
});

export { inMemoryRepo, supabaseRepository, InMemoryRepositoryManager, SupabaseRepositoryManager };
