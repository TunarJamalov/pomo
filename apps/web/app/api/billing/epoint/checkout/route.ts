import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { isBillingCycle, isProTier } from '@/lib/billing';
import { canBuy, currentSubscription, siteUrl, startCheckout } from '@/lib/epoint';
import { rateLimit } from '@/lib/rateLimit';

/**
 * Starts a Pomo Plus / Pro checkout from the pricing page form (plan + cycle)
 * and sends the signed-in buyer to Epoint's payment page.
 */
function pageLanguage(acceptLanguage: string | null): 'az' | 'en' | 'ru' {
  const first = (acceptLanguage || '').split(',')[0]?.trim().slice(0, 2).toLowerCase();
  return first === 'az' || first === 'ru' ? first : 'en';
}

export async function POST(request: Request) {
  const site = siteUrl();
  const back = (path: string) => NextResponse.redirect(`${site}${path}`, 303);

  // Only our own pricing page may start a checkout
  const origin = request.headers.get('origin');
  if (process.env.NODE_ENV === 'production' && origin && new URL(origin).host !== new URL(site).host) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const session = await getServerSession(authOptions);
  const discordId = (session?.user as { id?: string } | undefined)?.id;
  if (!discordId) return back('/pricing#pricing');

  const form = await request.formData().catch(() => null);
  const plan = form?.get('plan');
  const cycle = form?.get('cycle');
  if (!isProTier(plan) || !isBillingCycle(cycle)) return back('/pricing#pricing');

  if (!canBuy(discordId)) return back('/pricing?checkout=closed#pricing');
  if (!rateLimit(`epoint-checkout:${discordId}`, 5, 10 * 60_000)) return back('/billing?checkout=busy');

  // One running subscription at a time; a cancelled one can be replaced by a new plan
  const current = currentSubscription(discordId);
  if (current && !current.cancel_at_period_end) return back('/billing?checkout=active');

  try {
    const paymentPage = await startCheckout(discordId, plan, cycle, pageLanguage(request.headers.get('accept-language')));
    return NextResponse.redirect(paymentPage, 303);
  } catch (err) {
    console.error('[BILLING]', err instanceof Error ? err.message : err);
    return back('/billing?checkout=error');
  }
}
