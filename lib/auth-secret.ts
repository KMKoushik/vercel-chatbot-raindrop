/** Signs session cookies. Set AUTH_SECRET when you deploy; the built-in value is for local development. */
export const AUTH_SECRET =
  process.env.AUTH_SECRET ?? "local-development-secret-set-AUTH_SECRET";
