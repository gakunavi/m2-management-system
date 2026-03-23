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
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.partnerId = user.partnerId;
        token.businesses = user.businesses;
      }
      // セッション更新トリガー: DBから最新ユーザー情報を取得
      if (trigger === 'update' && token.id) {
        const freshUser = await prisma.user.findUnique({
          where: { id: Number(token.id) },
          include: {
            businessAssignments: {
              include: { business: true },
              where: { business: { businessIsActive: true } },
            },
          },
        });
        if (freshUser) {
          token.name = freshUser.userName;
          token.email = freshUser.userEmail;
          token.role = freshUser.userRole;
          token.partnerId = freshUser.userPartnerId;
          token.businesses = freshUser.businessAssignments.map((a) => ({
            id: a.business.id,
            businessCode: a.business.businessCode,
            businessName: a.business.businessName,
          }));
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = Number(token.id);
      session.user.name = token.name ?? '';
      session.user.email = token.email ?? '';
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
    maxAge: 30 * 24 * 60 * 60, // 30日
  },
  secret: process.env.NEXTAUTH_SECRET,
};
