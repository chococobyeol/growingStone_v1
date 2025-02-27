import { supabase } from '$lib/supabaseClient';

// 출석 체크 함수
export async function checkAttendance(): Promise<{ success: boolean; message: string; reward?: number }> {
  try {
    // 현재 로그인 세션 확인
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData?.session?.user) {
      console.error("세션 확인 실패:", sessionError);
      return { success: false, message: "attendance.sessionError" };
    }
    const userId = sessionData.session.user.id;
    const today = new Date();
    const kstDate = new Date(today.getTime());
    kstDate.setHours(kstDate.getHours() + 9); // UTC+9 적용
    const todayStr = kstDate.toISOString().split('T')[0];

    // 사용자 프로필에서 마지막 출석 날짜와 현재 잔액 가져오기
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('last_attendance_date, balance')
      .eq('id', userId)
      .single();
    if (profileError) {
      console.error("프로필 불러오기 실패:", profileError);
      return { success: false, message: "attendance.profileError" };
    }

    // 이미 오늘 출석한 경우 (알림 없이 그냥 넘어감)
    if (profile.last_attendance_date === todayStr) {
      return { success: true, message: "" };
    }

    // 오늘 처음 출석한 경우 보너스 지급 (100 stone)
    const rewardAmount = 100;
    const newBalance = Number(profile.balance) + rewardAmount;

    // 프로필 업데이트 (마지막 출석 날짜와 잔액 변경)
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        last_attendance_date: todayStr,
        balance: newBalance
      })
      .eq('id', userId);
    
    if (updateError) {
      console.error("출석 체크 업데이트 실패:", updateError);
      return { success: false, message: "attendance.updateFailed" };
    }
    
    return {
      success: true,
      message: "attendance.success",
      reward: rewardAmount
    };
  } catch (error) {
    console.error("출석 체크 중 오류 발생:", error);
    return { success: false, message: "attendance.error" };
  }
}
