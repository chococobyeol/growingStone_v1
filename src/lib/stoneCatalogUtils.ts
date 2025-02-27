import { supabase } from '$lib/supabaseClient';

export async function recordAcquiredStone(stoneType: string): Promise<void> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    console.error("세션 로드 실패:", sessionError);
    return;
  }
  const userId = sessionData?.session?.user?.id;
  if (!userId) {
    console.error("사용자 정보가 없습니다.");
    return;
  }

  // 해당 돌에 대한 획득 기록 조회
  const { data, error } = await supabase
    .from('acquired_stones')
    .select('*')
    .eq('user_id', userId)
    .eq('stone_type', stoneType)
    .maybeSingle();

  if (error) {
    console.error("획득 기록 조회 실패:", error);
    return;
  }

  if (!data) {
    // 기존 기록이 없다면 새로운 레코드 삽입
    const { error: insertError } = await supabase
      .from('acquired_stones')
      .insert([{ user_id: userId, stone_type: stoneType, acquired_count: 1 }]);
    if (insertError) {
      console.error("획득 기록 삽입 실패:", insertError);
    }
  } else {
    // 기존 기록이 있으면 획득 횟수 1 증가
    const { error: updateError } = await supabase
      .from('acquired_stones')
      .update({ acquired_count: data.acquired_count + 1 })
      .eq('id', data.id);
    if (updateError) {
      console.error("획득 기록 업데이트 실패:", updateError);
    }
  }
}
