import { supabase } from '$lib/supabaseClient';
import { loadUserXpData, userXpData } from '$lib/xpUtils';

export async function load() {
  // CSV 파일에서 xp 데이터 로드 (레벨별 누적 xp 임계치 등)
  await loadUserXpData();

  // 현재 사용자 세션 정보 확인
  const { data: sessionData } = await supabase.auth.getSession();
  let profileData = null;

  if (sessionData?.session?.user) {
    const userId = sessionData.session.user.id;
    const { data, error } = await supabase
      .from('profiles')
      .select('xp, level')
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
}
