import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number };

    const result = await prisma.notification.deleteMany({
      where: { userId: user.id },
    });

    return NextResponse.json({
      success: true,
      data: { deletedCount: result.count },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
