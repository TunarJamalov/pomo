import { TransactionContext } from '../transaction/transaction-manager';

export interface CreateSessionData {
  userId: string;
  guildId?: string;
  channelId?: string;
  messageId?: string;
  duration: number;
  title: string;
  startedAt?: Date;
  endsAt?: Date;
  subject?: string;
  todoId?: number;
  pomodoroData?: any;
}

export interface Session {
  id: number | string;
  user_id: string;
  guild_id: string | null;
  channel_id: string | null;
  message_id: string | null;
  duration: number;
  title: string;
  started_at: string;
  ends_at: string | null;
  completed: boolean;
  reminder_sent: boolean;
  paused: boolean;
  paused_at: string | null;
  paused_total_seconds: number;
  pause_count: number;
  todo_id: number | null;
  subject: string;
  pomodoro_data: string | null;
  goal_text: string | null;
  outcome: string | null;
  buddy_match_key: string | null;
}

export interface SessionRepository {
  createSession(ctx: TransactionContext, data: CreateSessionData): Promise<Session>;
  getSessionById(ctx: TransactionContext, sessionId: number): Session | null;
  getActiveSession(ctx: TransactionContext, userId: string): Promise<Session | null>;
  getUncompletedSessions(ctx: TransactionContext): Session[];
  pauseSession(ctx: TransactionContext, sessionId: number): boolean;
  resumeSession(ctx: TransactionContext, sessionId: number): boolean;
  completeSession(ctx: TransactionContext, sessionId: number): Session | null;
  cancelSession(ctx: TransactionContext, sessionId: number): boolean;
  updateMessageId(ctx: TransactionContext, sessionId: number, messageId: string): boolean;
  updatePomodoroData(ctx: TransactionContext, sessionId: number, data: any): boolean;
  markReminderSent(ctx: TransactionContext, sessionId: number): boolean;
}
