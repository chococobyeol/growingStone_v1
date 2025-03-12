import type { RequestHandler } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const payload = await request.json();
    const { id, type, size, totalElapsed, countdown, profileId, last_updated } = payload;

    // DB에서 현재 돌의 last_updated(및 discovered_at) 값을 조회
    const { data: existingStone } = await supabase
      .from('stones')
      .select('last_updated, discovered_at')
      .eq('id', id)
      .single();

    // 만약 돌이 존재하고 클라이언트의 업데이트 시각이 DB의 last_updated보다 이전이면 업데이트를 건너뜁니다.
    if (existingStone && existingStone.last_updated && last_updated) {
      const dbLastUpdated = new Date(existingStone.last_updated);
      const clientLastUpdated = new Date(last_updated);
      if (clientLastUpdated <= dbLastUpdated) {
        return new Response(JSON.stringify({ message: 'Outdated update ignored' }), { status: 200 });
      }
    }

    // upsert할 객체 구성 (새로 생성될 경우 discovered_at도 추가)
    const upsertData: any = {
      id,
      type,
      size,
      totalElapsed,
      name: payload.name || 'default',
      last_updated: last_updated ? last_updated : new Date().toISOString()
    };

    if (!existingStone) {
      upsertData.discovered_at = new Date().toISOString();
    }

    const { error: stoneError } = await supabase.from('stones').upsert(upsertData);
    if (stoneError) {
      return new Response(JSON.stringify({ error: stoneError.message }), { status: 500 });
    }

    // 프로필의 remaining_time 칼럼 업데이트
    if (profileId && countdown !== undefined) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ remaining_time: countdown })
        .eq('id', profileId);
      if (profileError) {
        return new Response(JSON.stringify({ error: profileError.message }), { status: 500 });
      }
    }

    return new Response(JSON.stringify({ message: 'Stone state saved successfully' }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Invalid request payload' }), { status: 400 });
  }
};
