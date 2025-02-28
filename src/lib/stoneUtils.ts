import { supabase } from '$lib/supabaseClient';

export async function createStone(
  stoneType: string,
  stoneName: string,
  stoneSize: number
): Promise<{ success: boolean; message: string; stone?: any }> {
  try {
    // 세션 및 사용자 정보 확인
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData?.session?.user) {
      return { success: false, message: '로그인이 필요합니다.' };
    }
    const userId = sessionData.session.user.id;

    // 프로필에서 storage_limit 조회
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('storage_limit')
      .eq('id', userId)
      .single();
    if (profileError || !profile) {
      return { success: false, message: '프로필 정보를 불러오는 데 실패했습니다.' };
    }
    const storageLimit = profile.storage_limit;

    // 현재 보관 중인 돌 개수 확인 (정확한 count 사용)
    const { count, error: countError } = await supabase
      .from('stones')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (countError) {
      return { success: false, message: '보관 중인 돌 수를 가져오는 데 실패했습니다.' };
    }
    if ((count ?? 0) >= storageLimit) {
      return { success: false, message: '보관함이 가득 차 있어 구매할 수 없습니다.' };
    }

    // 돌 생성 처리
    const { data, error } = await supabase
      .from('stones')
      .insert({
        user_id: userId,
        type: stoneType,
        name: stoneName,
        size: stoneSize,
        discovered_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      return { success: false, message: '돌 생성에 실패했습니다: ' + error.message };
    }
    return { success: true, message: '돌 생성에 성공했습니다.', stone: data };
  } catch (error) {
    return { success: false, message: '오류 발생: ' + (error as Error).message };
  }
}
