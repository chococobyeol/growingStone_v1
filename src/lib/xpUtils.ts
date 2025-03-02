import { supabase } from '$lib/supabaseClient';

export let userXpData: { level: number; nextRequiredXp: number; cumulativeXp: number }[] = [];

// CSV 파일을 불러와서 파싱하는 함수 (간단한 파싱 예시; 필요하면 papaparse 같은 라이브러리 사용)
export async function loadUserXpData() {
  try {
    const response = await fetch('/userXpTable.csv');
    const csvText = await response.text();
    const lines = csvText.split('\n').filter(line => line.trim() !== '');
    // 첫 줄(header)은 건너뛰고 데이터만 파싱 (CSV 파일이 "level,?,nextRequiredXp,cumulativeXp" 등으로 구성되어 있다고 가정)
    userXpData = lines.slice(1).map(line => {
      const [levelStr, , nextRequiredXpStr, cumulativeXpStr] = line.split(',');
      return {
        level: parseInt(levelStr),
        nextRequiredXp: parseInt(nextRequiredXpStr),
        cumulativeXp: parseInt(cumulativeXpStr)
      };
    });
  } catch (error) {
    console.error('userXpTable.csv 로드 실패:', error);
  }
}

// 매 초마다 호출하여 사용자 XP를 갱신하는 함수
export async function updateUserXp(elapsedSeconds: number = 1) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    console.error('세션 로드 실패:', sessionError);
    return;
  }
  if (!sessionData?.session?.user) {
    console.error('로그인된 사용자가 없습니다.');
    return;
  }
  const userId = sessionData.session.user.id;
  
  // 현재 프로필 데이터 불러오기
  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('xp, level')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) {
    console.error('프로필 로드 실패:', profileError);
    return;
  }
  
  let currentXp = profileData?.xp || 0;
  let currentLevel = profileData?.level || 1;
  
  // 경과된 초만큼 xp를 증가시킵니다.
  currentXp += elapsedSeconds;
  
  // CSV 데이터를 통해 현재 레벨의 임계치 정보를 가져와 레벨업 체크
  let newLevel = currentLevel;
  if (userXpData && userXpData.length > 0) {
    const currentLevelData = userXpData.find(item => item.level === currentLevel);
    if (currentLevelData && currentXp >= currentLevelData.cumulativeXp) {
      newLevel = currentLevel + 1;
    }
  }
  
  // 프로필 테이블 업데이트
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ xp: currentXp, level: newLevel })
    .eq('id', userId);
  if (updateError) {
    console.error('경험치 업데이트 실패:', updateError);
  }
}
