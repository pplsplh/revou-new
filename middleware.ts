import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Protected route prefixes.
 *
 * Any request whose pathname starts with one of these strings requires an
 * authenticated session. Unauthenticated visitors are redirected to /login
 * with a `callbackUrl` query parameter so they are sent back after signing in.
 *
 * Requirements: 1.5, 1.6
 */
const PROTECTED_PREFIXES = ['/dashboard', '/generate', '/subscription'] as const;

/**
 * Routes that authenticated users should NOT be able to visit (e.g. the
 * login / register pages). They are redirected to /dashboard instead.
 */
const AUTH_ROUTES = ['/login', '/register', '/forgot-password'] as const;

/**
 * Next.js middleware — runs on the Edge Runtime before every matching request.
 *
 * Logic:
 *  1. If the request targets a protected route and the user is NOT signed in,
 *     redirect to /login?callbackUrl=<original-url>.
 *  2. If the request targets an auth route and the user IS already signed in,
 *     redirect to /dashboard (avoid showing login page to logged-in users).
 *  3. All other requests pass through unchanged.
 */
export default auth(function middleware(request: NextRequest) {
  const { nextUrl } = request;
  const pathname = nextUrl.pathname;

  // `auth` augments the request with a `auth` property when using the
  // NextAuth v5 middleware wrapper. We cast to access it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = (request as any).auth;
  const isAuthenticated = !!session?.user;

  // ── 1. Protect private routes ─────────────────────────────────────────────
  const isProtectedRoute = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  if (isProtectedRoute && !isAuthenticated) {
    const loginUrl = new URL('/login', nextUrl.origin);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── 2. Redirect authenticated users away from auth pages ─────────────────
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));

  if (isAuthRoute && isAuthenticated) {
    return NextResponse.redirect(new URL('/dashboard', nextUrl.origin));
  }

  // ── 3. Pass through ───────────────────────────────────────────────────────
  return NextResponse.next();
});

/**
 * Matcher configuration — tells Next.js which paths this middleware should run
 * on. We exclude static assets, images, and the NextAuth API routes themselves
 * to avoid infinite redirect loops and unnecessary overhead.
 */
export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     *  - _next/static  (static files)
     *  - _next/image   (image optimisation)
     *  - favicon.ico
     *  - api/auth/*    (NextAuth internal routes — must not be intercepted)
     *  - Files with an extension (e.g. .png, .svg, .css, .js)
     */
    '/((?!_next/static|_next/image|favicon.ico|api/auth|.*\\..*).*)',
  ],
};
