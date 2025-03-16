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
    // 첫 줄을 건너뛰지 않고 모든 데이터를 파싱합니다.
    userXpData = lines.map(line => {
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

/*
// 아래 코드는 더 이상 사용하지 않는 누적 xp 변화량 및 디바운스 로직입니다.

let pendingXpDelta = 0;
let xpDebounceTimeout: ReturnType<typeof setTimeout> | null = null;
let lastXpUpdateTime = Date.now();

// externalDelta를 선택적 인자로 받아, 제공되면 그 값을 사용하고, 없으면 내부 계산을 사용합니다.
export async function updateUserXp(externalDelta?: number) {
  const now = Date.now();
  let delta: number;
  if (typeof externalDelta === 'number') {
    // 외부에서 계산한 경과 시간을 사용 (예: updateLoop에서 전달된 elapsedSeconds)
    delta = externalDelta;
  } else {
    // 인자가 없으면, 마지막 호출 이후 경과한 시간을 계산합니다.
    delta = (now - lastXpUpdateTime) / 1000;
  }
  lastXpUpdateTime = now;
  pendingXpDelta += delta;

  if (xpDebounceTimeout) clearTimeout(xpDebounceTimeout);
  xpDebounceTimeout = setTimeout(async () => {
    const totalDelta = pendingXpDelta;
    pendingXpDelta = 0;
    xpDebounceTimeout = null;

    // 세션 및 프로필 데이터 로드를 통해 사용자 ID를 가져옵니다.
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

    // 누적된 xp 증분(totalDelta)을 서버로 전송합니다.
    const xpUpdateData = { userId, delta: totalDelta };
    sendXpUpdate(xpUpdateData);
  }, 500); // 500ms 디바운스 시간 (필요에 따라 조정)
}
*/
