import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'メールアドレス', type: 'email' },
        password: { label: 'パスワード', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { userEmail: credentials.email },
          include: {
            businessAssignments: {
              include: { business: true },
              where: { business: { businessIsActive: true } },
            },
          },
        });

        if (!user || !user.userIsActive) {
          return null;
        }

        const isValid = await bcrypt.compare(
          credentials.password,
          user.userPasswordHash,
        );

        if (!isValid) {
          return null;
        }

        return {
          id: user.id.toString(),
          email: user.userEmail,
          name: user.userName,
          role: user.userRole,
          partnerId: user.userPartnerId,
          businesses: user.businessAssignments.map((a) => ({
            id: a.business.id,
            businessCode: a.business.businessCode,
            businessName: a.business.businessName,
          })),
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.partnerId = user.partnerId;
        token.businesses = user.businesses;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = Number(token.id);
      session.user.role = token.role;
      session.user.partnerId = token.partnerId;
      session.user.businesses = token.businesses;
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24時間
  },
  secret: process.env.NEXTAUTH_SECRET,
};
