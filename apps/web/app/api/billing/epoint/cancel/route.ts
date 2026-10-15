import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { currentSubscription, epointDb, siteUrl } from '@/lib/epoint';

/**
 * Cancels (or resumes) the signed-in user's subscription from the billing page.
 * Cancelling stops the next renewal; the plan stays until the paid period ends.
 */
export async function POST(request: Request) {
  const site = siteUrl();
  const origin = request.headers.get('origin');
  if (process.env.NODE_ENV === 'production' && origin && new URL(origin).host !== new URL(site).host) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const session = await getServerSession(authOptions);
  const discordId = (session?.user as { id?: string } | undefined)?.id;
  if (!discordId) return NextResponse.redirect(`${site}/billing`, 303);

  const form = await request.formData().catch(() => null);
  const action = form?.get('action');
  const sub = currentSubscription(discordId);
  if (sub && (action === 'cancel' || action === 'resume')) {
    epointDb()
      .prepare("UPDATE epoint_subscriptions SET cancel_at_period_end = ?, updated_at = datetime('now') WHERE id = ? AND discord_id = ?")
      .run(action === 'cancel' ? 1 : 0, sub.id, discordId);
    console.log(`[BILLING] Subscription #${sub.id} ${action === 'cancel' ? 'cancelled' : 'resumed'} by its owner`);
  }
  return NextResponse.redirect(`${site}/billing?${action === 'cancel' ? 'cancelled=1' : 'resumed=1'}`, 303);
}
