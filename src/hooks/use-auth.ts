'use client';

import { useSession, signOut as nextAuthSignOut } from 'next-auth/react';
import { useCallback, useMemo } from 'react';

export type UserRole = 'admin' | 'staff' | 'partner_admin' | 'partner_staff';

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  partnerId: number | null;
  businesses: {
    id: number;
    businessCode: string;
    businessName: string;
  }[];
}

export function useAuth() {
  const { data: session, status, update } = useSession();

  const user = useMemo((): AuthUser | null => {
    if (!session?.user) return null;
    return {
      id: session.user.id,
      email: session.user.email ?? '',
      name: session.user.name ?? '',
      role: session.user.role as UserRole,
      partnerId: session.user.partnerId,
      businesses: session.user.businesses ?? [],
    };
  }, [session]);

  const isLoading = status === 'loading';
  const isAuthenticated = status === 'authenticated';

  const hasRole = useCallback(
    (role: UserRole | UserRole[]): boolean => {
      if (!user) return false;
      const roles = Array.isArray(role) ? role : [role];
      return roles.includes(user.role);
    },
    [user],
  );

  const isAdmin = user?.role === 'admin';
  const canEdit = isAdmin || user?.role === 'staff';
  const canDelete = isAdmin;
  const isPartner = user?.role === 'partner_admin' || user?.role === 'partner_staff';

  const signOut = useCallback(async () => {
    await nextAuthSignOut({ callbackUrl: '/login' });
  }, []);

  const refreshSession = useCallback(async () => {
    await update();
  }, [update]);

  return {
    user,
    isLoading,
    isAuthenticated,
    hasRole,
    isAdmin,
    canEdit,
    canDelete,
    isPartner,
    signOut,
    refreshSession,
  };
}
