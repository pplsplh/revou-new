import { handlers } from '@/lib/auth';

/**
 * NextAuth v5 catch-all route handler.
 *
 * This file re-exports the GET and POST handlers produced by NextAuth so
 * that Next.js App Router can handle all `/api/auth/*` requests:
 *   - GET  /api/auth/session
 *   - GET  /api/auth/providers
 *   - GET  /api/auth/csrf
 *   - GET  /api/auth/callback/:provider
 *   - POST /api/auth/signin/:provider
 *   - POST /api/auth/signout
 *   - etc.
 *
 * Requirements: 1.5, 1.6
 */
export const { GET, POST } = handlers;
