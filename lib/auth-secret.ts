/**
 * Signs session cookies. Set AUTH_SECRET for anything shared; the fallback only makes local testing work with no
 * setup, and anyone who knows it can forge a session.
 */
export const AUTH_SECRET =
  process.env.AUTH_SECRET ?? "local-test-only-secret-set-AUTH_SECRET";
