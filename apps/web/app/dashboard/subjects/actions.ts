"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getSubjectService, getIdentityService, isProductivityDbEnabled } from "@/lib/services";
import { revalidatePath } from "next/cache";

/**
 * Helper to resolve the Postgres UUID from the Discord Snowflake in NextAuth session
 */
async function resolveUserId() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) throw new Error("Unauthorized");
    
    const discordId = (session.user as any).id; // from NextAuth profile
    const identityService = getIdentityService();
    
    // Look up the internal Postgres UUID mapped to this Discord ID
    const userId = await identityService.resolveIdentity('discord', discordId).then(r => r.userId);
    if (!userId) {
        throw new Error("User record not found in database.");
    }
    return userId;
}

export async function createSubjectAction(formData: FormData): Promise<void> {
    if (!isProductivityDbEnabled()) return;
    const userId = await resolveUserId();
    const name = formData.get("name")?.toString();
    const color = formData.get("color")?.toString() || "#3B82F6";

    if (!name || name.trim().length === 0) return;

    const subjectService = getSubjectService();
    await subjectService.createSubject(userId, name.trim(), color);
    
    revalidatePath("/dashboard/subjects");
}

export async function updateSubjectAction(subjectId: string, updates: { name?: string, color?: string }): Promise<void> {
    if (!isProductivityDbEnabled()) return;
    const userId = await resolveUserId();
    // Server actions accept any JSON from the client: copy only the editable fields.
    const safe: { name?: string, color?: string } = {};
    if (typeof updates?.name === "string" && updates.name.trim()) safe.name = updates.name.trim().slice(0, 100);
    if (typeof updates?.color === "string" && /^#[0-9a-fA-F]{6}$/.test(updates.color)) safe.color = updates.color;
    if (Object.keys(safe).length === 0) return;
    const subjectService = getSubjectService();
    await subjectService.updateSubject(userId, subjectId, safe);
    revalidatePath("/dashboard/subjects");
}

export async function deleteSubjectAction(subjectId: string): Promise<void> {
    if (!isProductivityDbEnabled()) return;
    const userId = await resolveUserId();
    const subjectService = getSubjectService();
    await subjectService.deleteSubject(userId, subjectId);
    revalidatePath("/dashboard/subjects");
}
