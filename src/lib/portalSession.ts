// The client portal doesn't use Supabase Auth — a session is just a token
// in localStorage, scoped per business (a client could in theory have
// projects with more than one Project Flow business).
export function portalSessionKey(ownerId: string): string {
  return `pf_portal_session_${ownerId}`;
}
