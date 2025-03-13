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

// 매 초마다 호출하여 경험치 증가량(delta)를 누적 및 전송하는 함수
export async function updateUserXp(elapsedSeconds: number = 1) {
  // 화면상의 xp 변화는 그대로 두고, 서버에 전달할 증분(delta)만 누적
  pendingXpDelta += elapsedSeconds;
  if (xpDebounceTimeout) clearTimeout(xpDebounceTimeout);
  xpDebounceTimeout = setTimeout(async () => {
    const delta = pendingXpDelta;
    pendingXpDelta = 0;
    xpDebounceTimeout = null;

    // 세션 및 프로필 데이터 로드는 그대로 수행하여 사용자 ID를 가져옵니다.
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

    // 서버에는 누적 경험치 증분(delta)만 전송합니다.
    const xpUpdateData = { userId, delta };

    sendXpUpdate(xpUpdateData);
  }, 500); // 500ms 디바운스 시간 (필요에 따라 조정)
}
