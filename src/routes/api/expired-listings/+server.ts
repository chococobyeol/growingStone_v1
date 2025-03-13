// 파일 경로: src/routes/api/expired-listings/+server.ts, 파일명: +server.ts
import { json } from '@sveltejs/kit';
import { checkExpiredListingsAdmin } from '$lib/marketUtils.server';

export async function GET() {
  const result = await checkExpiredListingsAdmin();
  return json(result);
}
