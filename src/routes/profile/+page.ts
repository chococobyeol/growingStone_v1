// 파일 경로: src/routes/profile/+page.ts, 파일명: +page.ts
import type { PageLoad } from './$types';
import { supabase } from '$lib/supabaseClient';
import { loadUserXpData, userXpData } from '$lib/xpUtils';

export const load: PageLoad = async (event) => {
  // event.fetch를 인자로 넘겨 SSR 환경에서도 상대 경로가 올바르게 해석되도록 합니다.
  await loadUserXpData(event.fetch);

  // 현재 사용자 세션 정보 확인
  const { data: sessionData } = await supabase.auth.getSession();
  let profileData = null;

  if (sessionData?.session?.user) {
    const userId = sessionData.session.user.id;
    const { data, error } = await supabase
      .from('profiles')
      .select('xp, level, nickname, user_code')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('프로필 데이터 로드 실패:', error);
    }
    profileData = data;
  }

  return {
    profileData,
    userXpData
  };
};
