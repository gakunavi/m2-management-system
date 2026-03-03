import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import type { Session } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/error-handler';

type ApiHandler = (
  request: NextRequest,
  context: { session: Session },
) => Promise<NextResponse>;

export function withApiAuth(handler: ApiHandler) {
  return async (request: NextRequest) => {
    try {
      const session = await getServerSession(authOptions);

      if (!session?.user) {
        throw ApiError.unauthorized();
      }

      return await handler(request, { session });
    } catch (error) {
      return handleApiError(error);
    }
  };
}
