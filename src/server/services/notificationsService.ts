import type { AppPrisma } from '../types';

export const notificationView = (record: any) => ({
  id: record.id,
  title: record.title,
  message: record.message,
  date: record.createdAt.toISOString(),
  read: record.isRead,
  type: record.type.toLowerCase(),
  link: record.link,
});

export const outboxView = (record: any) => ({
  id: record.id,
  recipientEmail: record.recipientEmail,
  recipientName: record.notification.user.name,
  subject: record.subject,
  status: record.status,
  attempts: record.attempts,
  lastError: record.lastError,
  sentAt: record.sentAt,
  createdAt: record.createdAt,
});

export const assistantConversationForUser = async (prisma: AppPrisma, userId: string, conversationId?: string) => {
  if (conversationId) {
    const existing = await prisma.assistantConversation.findFirst({ where: { id: conversationId, userId } });
    if (existing) return existing;
  }
  return prisma.assistantConversation.create({ data: { userId } });
};
