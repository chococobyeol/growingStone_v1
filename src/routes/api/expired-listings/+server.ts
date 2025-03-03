import { json } from '@sveltejs/kit';
import { checkExpiredListingsAdmin } from '$lib/marketUtils.server';

export async function GET() {
  const result = await checkExpiredListingsAdmin();
  return json(result);
}
