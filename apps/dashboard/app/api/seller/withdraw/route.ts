import { NextResponse } from 'next/server';
import { PROVIDER_ARC_URL, SELLER_ADMIN_TOKEN } from '@/lib/env';

/**
 * Server-side proxy so the admin token never reaches the browser — the client
 * form posts here, and this route attaches x-admin-token before forwarding to
 * provider-arc's own /v1/seller/withdraw.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  try {
    const res = await fetch(`${PROVIDER_ARC_URL}/v1/seller/withdraw`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-token': SELLER_ADMIN_TOKEN },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
