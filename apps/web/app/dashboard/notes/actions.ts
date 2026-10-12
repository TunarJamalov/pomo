"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getNoteService, getIdentityService, isProductivityDbEnabled } from "@/lib/services";
import { revalidatePath } from "next/cache";

async function resolveUserId() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) throw new Error("Unauthorized");
  const discordId = (session.user as any).id;
  const userId = await getIdentityService().resolveIdentity('discord', discordId).then(r => r.userId);
  if (!userId) throw new Error("User not found");
  return userId;
}

export async function createNoteAction(formData: FormData): Promise<void> {
  if (!isProductivityDbEnabled()) return;
  const userId = await resolveUserId();
  const title = formData.get("title")?.toString();
  const subjectId = formData.get("subjectId")?.toString() || undefined;

  if (!title || title.trim().length === 0) return;
  await getNoteService().createNote(userId, title.trim(), "", subjectId);
  revalidatePath("/dashboard/notes");
}

export async function updateNoteAction(noteId: string, updates: { title?: string; content_rich?: string; subject_id?: string }): Promise<void> {
  if (!isProductivityDbEnabled()) return;
  const userId = await resolveUserId();
  // Server actions accept any JSON from the client: copy only the editable fields.
  const safe: { title?: string; content_rich?: string; subject_id?: string } = {};
  if (typeof updates?.title === "string") safe.title = updates.title.trim().slice(0, 200);
  if (typeof updates?.content_rich === "string") safe.content_rich = updates.content_rich.slice(0, 200_000);
  if (typeof updates?.subject_id === "string") safe.subject_id = updates.subject_id;
  if (Object.keys(safe).length === 0) return;
  await getNoteService().updateNote(userId, noteId, safe);
  revalidatePath("/dashboard/notes");
}

export async function deleteNoteAction(noteId: string): Promise<void> {
  if (!isProductivityDbEnabled()) return;
  const userId = await resolveUserId();
  await getNoteService().deleteNote(userId, noteId);
  revalidatePath("/dashboard/notes");
}
