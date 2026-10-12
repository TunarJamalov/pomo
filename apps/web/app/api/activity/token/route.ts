import { NextResponse } from 'next/server';
import { createActivityToken } from '@/lib/activityAuth';

export async function POST(request: Request) {
  try {
    const { code } = await request.json();

    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: 'Missing Discord credentials in .env' }, { status: 500 });
    }

    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code: code,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Discord API Error:', data);
      return NextResponse.json({ error: 'Failed to exchange token' }, { status: response.status });
    }

    const userRes = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${data.access_token}` },
      cache: 'no-store',
    });

    if (!userRes.ok) {
      return NextResponse.json({ error: 'Failed to verify Discord user' }, { status: userRes.status });
    }

    const user = await userRes.json();
    const activity_token = createActivityToken(user);

    return NextResponse.json({ access_token: data.access_token, activity_token });
  } catch (error) {
    console.error('Token Exchange Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
