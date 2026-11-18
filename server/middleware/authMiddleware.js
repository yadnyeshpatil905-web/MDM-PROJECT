import { verifySupabaseToken, isSupabaseConfigured } from '../services/supabaseClient.js';
import { authService } from '../services/authService.js';

/**
 * Authentication Middleware
 * Enforces Requirement 5: Never trust a user ID supplied by frontend without verifying
 * the authenticated identity.
 */
export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || req.headers['x-auth-token'];
  
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Authorization header missing.'
    });
  }

  const token = authHeader.startsWith('Bearer ') 
    ? authHeader.substring(7).trim() 
    : authHeader.trim();

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Bearer token missing.'
    });
  }

  let verifiedUser = null;

  // 1. If Supabase is configured, verify Supabase JWT first
  if (isSupabaseConfigured()) {
    const supabaseUser = await verifySupabaseToken(token);
    if (supabaseUser) {
      verifiedUser = {
        id: supabaseUser.id,
        email: supabaseUser.email,
        authSource: 'supabase'
      };
    }
  }

  // 2. If not a Supabase token or in local session mode, check backend session store
  if (!verifiedUser) {
    const session = authService.verifySession(token);
    if (session) {
      verifiedUser = {
        id: session.userId,
        email: session.email || null,
        authSource: 'session'
      };
    }
  }

  if (!verifiedUser) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired authorization token.'
    });
  }

  // 3. Strict identity verification against body parameters
  // If the frontend explicitly sends a userId, ensure it matches the authenticated identity!
  if (req.body && req.body.userId && req.body.userId !== verifiedUser.id) {
    return res.status(403).json({
      success: false,
      error: 'Security Policy Violation: Supplied userId does not match authenticated identity.'
    });
  }

  req.user = verifiedUser;
  next();
}

/**
 * Optional Authentication Middleware
 * Attaches req.user if a valid Bearer token is present, without blocking
 * unauthenticated requests (used for merged demo + user vault listing).
 */
export async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization || req.headers['x-auth-token'];
  if (!authHeader) return next();

  const token = authHeader.startsWith('Bearer ')
    ? authHeader.substring(7).trim()
    : authHeader.trim();

  if (!token) return next();

  if (isSupabaseConfigured()) {
    const supabaseUser = await verifySupabaseToken(token);
    if (supabaseUser) {
      req.user = {
        id: supabaseUser.id,
        email: supabaseUser.email,
        authSource: 'supabase'
      };
      return next();
    }
  }

  const session = authService.verifySession(token);
  if (session) {
    req.user = {
      id: session.userId,
      email: session.email || null,
      authSource: 'session'
    };
  }
  return next();
}
