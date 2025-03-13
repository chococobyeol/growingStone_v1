// 파일 경로: src/lib/xpUtils.ts, 파일명: xpUtils.ts
import { supabase } from '$lib/supabaseClient';
import { sendXpUpdate } from '$lib/websocketClient';

export let userXpData: { level: number; nextRequiredXp: number; cumulativeXp: number }[] = [];

// SSR 환경에서도 사용 가능하도록 fetch 함수 인자를 추가합니다.
export async function loadUserXpData(fetchFunction: typeof fetch = fetch) {
  try {
    // 전달받은 fetch 함수를 사용하여 CSV 파일을 불러옵니다.
    const response = await fetchFunction('/userXpTable.csv');
    const csvText = await response.text();
    const lines = csvText.split('\n').filter(line => line.trim() !== '');
    // 첫 줄(header)은 건너뛰고 데이터만 파싱
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

// 누적 xp 변화량과 디바운스 타이머
let pendingXpDelta = 0;
let xpDebounceTimeout: ReturnType<typeof setTimeout> | null = null;

// 매 초마다 호출하여 사용자 XP를 갱신하는 함수
export async function updateUserXp(elapsedSeconds: number = 1) {
  // 즉시 화면상의 XP 변화는 유지하고, DB 업데이트는 누적 후에 전송
  pendingXpDelta += elapsedSeconds;
  if (xpDebounceTimeout) clearTimeout(xpDebounceTimeout);
  xpDebounceTimeout = setTimeout(async () => {
    const delta = pendingXpDelta;
    pendingXpDelta = 0;
    xpDebounceTimeout = null;

    // 세션 및 프로필 데이터 로드
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

    // 누적된 XP 반영
    currentXp += delta;

    // CSV 데이터 기반의 레벨업 체크
    let newLevel = currentLevel;
    if (userXpData && userXpData.length > 0) {
      const currentLevelData = userXpData.find(item => item.level === currentLevel);
      if (currentLevelData && currentXp >= currentLevelData.cumulativeXp) {
        newLevel = currentLevel + 1;
      }
    }

    // 웹소켓으로 전송할 xp 업데이트 데이터 구성
    const xpUpdateData = { userId, xp: currentXp, level: newLevel };

    // 웹소켓을 통해 경험치 업데이트 메시지 전송
    sendXpUpdate(xpUpdateData);
  }, 500); // 500ms 디바운스 시간 (필요에 따라 조정)
}
