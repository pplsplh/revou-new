import NextAuth, { type NextAuthConfig } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';

/**
 * NextAuth v5 (Auth.js) configuration.
 *
 * Providers:
 *  - Credentials: email + password (bcrypt verification)
 *  - Google OAuth 2.0
 *
 * Session strategy: JWT (edge-compatible, 30-day expiry)
 *
 * Requirements: 1.5, 1.6
 */
export const authConfig: NextAuthConfig = {
  // Use Prisma adapter for persisting OAuth accounts, sessions, and
  // verification tokens. The adapter is compatible with the database
  // models defined in prisma/schema.prisma.
  adapter: PrismaAdapter(prisma),

  // JWT strategy is edge-compatible and works with Next.js middleware.
  // Sessions are valid for 30 days (Req 1.6).
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
  },

  // Custom pages so NextAuth redirects to our own UI instead of the
  // built-in pages.
  pages: {
    signIn: '/login',
    error: '/login',
  },

  providers: [
    // ── Google OAuth 2.0 (Req 1.5) ─────────────────────────────────────────
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      // Request profile + email scopes
      authorization: {
        params: {
          scope: 'openid email profile',
        },
      },
    }),

    // ── Credentials: email / password (Req 1.6) ────────────────────────────
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;

        if (!email || !password) {
          return null;
        }

        // Look up the user by email
        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase().trim() },
        });

        // User not found or no password set (OAuth-only account)
        if (!user || !user.passwordHash) {
          return null;
        }

        // Verify password against stored bcrypt hash (Req 8.1)
        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) {
          return null;
        }

        // Return the user object that will be encoded into the JWT
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],

  callbacks: {
    /**
     * jwt callback — called whenever a JWT is created or updated.
     * We persist the user's database `id` in the token so it is
     * available in the `session` callback and in Server Components
     * via `auth()`.
     */
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },

    /**
     * session callback — shapes the session object that is returned
     * to the client. We expose `session.user.id` so components can
     * identify the current user without an extra DB round-trip.
     */
    async session({ session, token }) {
      if (token?.id && session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
};

// Export the NextAuth handler and helper utilities
export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
