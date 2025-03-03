import { supabaseAdmin } from '$lib/supabaseAdminClient.server';

export async function checkExpiredListingsAdmin() {
  try {
    const now = new Date().toISOString();

    // active 상태이면서 만료 시간이 현재보다 이전인 항목 찾기
    const { data, error } = await supabaseAdmin
      .from('market_listings')
      .select('id')
      .eq('status', 'active')
      .lt('expires_at', now);

    if (error) throw error;

    if (data && data.length > 0) {
      console.log(`${data.length}개의 만료된 항목을 관리자 권한으로 처리 중...`);
      const ids = data.map(item => item.id);

      // 관리자 권한을 사용하여 업데이트 (RLS 정책 무시)
      const { error: updateError, data: updatedListings } = await supabaseAdmin
        .from('market_listings')
        .update({ status: 'expired' })
        .in('id', ids)
        .select();

      if (updateError) {
        console.error('관리자 만료 처리 실패:', updateError);
        console.log('업데이트 시도한 대상 ID들:', ids);
      } else {
        console.log('관리자 권한 - 만료된 항목 업데이트 성공:', updatedListings);
      }
    }

    return { success: true };
  } catch (error) {
    console.error('관리자 권한 만료 확인 오류:', error);
    return { success: false, error };
  }
}
