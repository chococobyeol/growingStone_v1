import type { RequestHandler } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const payload = await request.json();
    const { id, type, size, totalElapsed, countdown } = payload;
    // stone 이름은 기존 상태를 유지하거나 추가로 payload에 포함된 값 사용
    const { error } = await supabase.from('stones').upsert({
      id,
      type,
      size,
      totalElapsed,
      name: payload.name || 'default', // 필요 시 수정
      discovered_at: new Date().toISOString()
      // user_id 등 추가 정보가 필요하면 여기서 포함
    });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
    return new Response(JSON.stringify({ message: 'Stone state saved successfully' }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Invalid request payload' }), { status: 400 });
  }
};
