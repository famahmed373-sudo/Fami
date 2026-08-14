export function getDb() {
  // Returns a safe DB interface. Prefer using this instead of importing @supabase/supabase-js directly.
  // In production this returns window.db.getClient() if initialized; in demo/mock it returns window.db (noop tables).
  if (typeof window === 'undefined') {
    // Server-side or build-time: return a noop shim
    return {
      from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
      auth: { signIn: () => Promise.resolve({ data: null, error: null }), signOut: () => Promise.resolve({ error: null }) }
    };
  }
  return window.db || {
    from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
    auth: { signIn: () => Promise.resolve({ data: null, error: null }), signOut: () => Promise.resolve({ error: null }) }
  };
}
