export function checkRenderEnvironment(env) {
  const errors = [], warnings = [];
  const required = key => { if (!env[key]?.trim()) errors.push(`${key} is required.`); };
  for (const key of ['DATABASE_URL', 'BETTER_AUTH_SECRET', 'BETTER_AUTH_URL', 'OPENAI_API_KEY']) required(key);
  if (env.BETTER_AUTH_SECRET && env.BETTER_AUTH_SECRET.length < 32) errors.push('BETTER_AUTH_SECRET must contain at least 32 characters.');
  for (const key of ['BETTER_AUTH_URL', 'NEXT_PUBLIC_AIFORCE_URL', 'EASSIST_APP_URL', 'SECURITY_SCAN_APP_URL', 'SECURITY_SCAN_TARGET_URL']) {
    if (!env[key]) continue;
    try { const url = new URL(env[key]); if (url.protocol !== 'https:' || ['localhost','127.0.0.1','[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error(); }
    catch { errors.push(`${key} must be a public HTTPS origin without a path or credentials.`); }
  }
  for (const key of ['RENDER_RUN_MIGRATIONS', 'RENDER_RUN_WORKERS', 'RENDER_RUN_SECURITY_WORKER', 'AUTH_DISABLE_SIGNUP', 'EPACE_REQUIRE_SAFETY', 'EPACE_BLOCK_FLAGGED', 'REVIEW_CHAT_ENABLE_PAID_AI', 'REVIEW_CHAT_NATURAL_AI', 'VULNERABILITY_ENABLE_PAID_AI']) {
    if (env[key] !== undefined && !['true', 'false'].includes(env[key])) errors.push(`${key} must be true or false.`);
  }
  if (env.DATABASE_URL) {
    try { const url = new URL(env.DATABASE_URL); if (!['postgres:', 'postgresql:'].includes(url.protocol) || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error(); }
    catch { errors.push('DATABASE_URL must point to a reachable hosted PostgreSQL database.'); }
  }
  if (env.RENDER_RUN_WORKERS !== 'false') {
    for (const key of ['EASSIST_WORKER_TOKEN', 'MAIL_WORKER_TOKEN']) if (!env[key] || env[key].length < 32) errors.push(`${key} must contain at least 32 characters for bundled workers.`);
  }
  if (env.SMTP_USER || env.SMTP_PASS) {
    for (const key of ['SMTP_USER', 'SMTP_PASS', 'MAIL_ENCRYPTION_KEY']) required(key);
    if (!/^[a-f\d]{64}$/i.test(env.MAIL_ENCRYPTION_KEY || '')) errors.push('MAIL_ENCRYPTION_KEY must be exactly 64 hexadecimal characters.');
    warnings.push('SMTP ports 25, 465 and 587 are blocked on Render Free. Gmail delivery requires a paid instance.');
  } else warnings.push('Email is unconfigured. Email/password signup verification cannot be delivered.');
  if (env.RENDER_RUN_SECURITY_WORKER === 'true' && (!env.SECURITY_SCAN_WORKER_TOKEN || env.SECURITY_SCAN_WORKER_TOKEN.length < 32 || !env.SECURITY_SCAN_TARGET_URL)) errors.push('The bundled security worker needs SECURITY_SCAN_TARGET_URL and a SECURITY_SCAN_WORKER_TOKEN of at least 32 characters.');
  if (env.AUTH_DISABLE_SIGNUP !== 'true') warnings.push('Public signup is enabled. Close it with AUTH_DISABLE_SIGNUP=true after provisioning approved accounts if required.');
  return { errors, warnings };
}
