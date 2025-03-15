<!-- 파일 경로: src/routes/+page.svelte, 파일명: +page.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { goto, beforeNavigate } from '$app/navigation';
  import { currentStone, getRandomStoneType } from '$lib/stoneStore';
  import { get } from 'svelte/store';
  import { t } from 'svelte-i18n';
  // supabase 리얼타임 관련 타입 및 기능은 제거합니다.
  import { recordAcquiredStone } from '$lib/stoneCatalogUtils';
  import { checkAttendance } from '$lib/attendanceUtils';
  import { getStoneImagePath, getDefaultImagePath } from '$lib/imageUtils';
  import { isPrimary } from '$lib/activeSessionManager';
  import { sendStoneUpdate, sendXpUpdate, clearLocalMessageQueue } from '$lib/websocketClient';
  import { session } from '$lib/authStore';

  // 페이지의 load 함수로부터 전달받은 data 객체 (프로필 및 CSV 데이터)
  export let data: {
    profileData: { xp: number; level: number } | null,
    userXpData: { level: number; nextRequiredXp: number; cumulativeXp: number }[]
  };

  // 초기 xp와 레벨 (프로필에서 받아온 값이 없으면 기본값 사용)
  let userXp: number = data.profileData ? data.profileData.xp : 0;
  let userLevel: number = data.profileData ? data.profileData.level : 1;

  // CSV에 담긴 누적 xp 데이터를 활용하여 현재 xp에 따른 레벨을 계산하는 함수
  function calculateLevel(
    xp: number,
    xpData: { level: number; nextRequiredXp: number; cumulativeXp: number }[]
  ): { level: number, requiredXp: number } {
    // 레벨 순서대로 정렬 (이미 정렬되어 있다면 생략 가능)
    const sortedData = [...xpData].sort((a, b) => a.level - b.level);
    let calculatedLevel = sortedData[0].level;
    let baseXp = 0;
    let requiredXp = sortedData[0].cumulativeXp;
    for (let i = 0; i < sortedData.length; i++) {
      if (i > 0) {
        baseXp = sortedData[i - 1].cumulativeXp;
      }
      if (xp < sortedData[i].cumulativeXp) {
        calculatedLevel = sortedData[i].level;
        requiredXp = sortedData[i].cumulativeXp - baseXp;
        break;
      }
      if (i === sortedData.length - 1) {
        calculatedLevel = sortedData[i].level;
        requiredXp = sortedData[i].cumulativeXp - baseXp;
      }
    }
    return { level: calculatedLevel, requiredXp };
  }

  /* =====================
   * 1) 돌 정보 & 성장 로직
   * ===================== */
  const growthFactor = 1.0; // k 값

  let computedSize = 1;
  // countdown은 DB에 저장된 remaining_time 값을 사용 (초 단위)
  let countdown = 0;

  // 자금(balance)을 저장할 변수 (단위: stone)
  let balance: number = 0;

  let attendanceMsg: string = "";
  let copyMessage: string = "";

  let detailedSizeShown = false;

  function formatSize(num: number) {
    return num.toFixed(4);
  }

  // 초 단위의 시간을 "HH:MM:SS" 형식으로 변환 (예: 01:23:45)
  function formatTime(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  /* 사용하지 않는 함수: randomizeStone
  function randomizeStone() {
    const randomType = getRandomStoneType();
    currentStone.update((stone) => ({
      ...stone,
      type: randomType,
      baseSize: 1,
      totalElapsed: 0,
      name: randomType
    }));
  }
  */

  // 돌 이름 수정 함수 (번역 적용)
  async function editStoneName() {
    const stone = get(currentStone);
    const translate = get(t);
    const newName = prompt(translate('changeStoneNamePrompt'), stone.name);
    if (newName && newName.trim() !== '') {
      const updatedStone = {
        ...stone,
        name: newName,
        last_updated: new Date().toISOString()
      };
      currentStone.set(updatedStone);
      const { error } = await supabase
        .from('stones')
        .update({ name: newName, last_updated: updatedStone.last_updated })
        .eq('id', stone.id);
      if (error) {
        console.error("DB 업데이트 실패:", error);
      }
    }
  }

  /* =====================
   * 2) 메뉴 (배경 클릭)
   * ===================== */
  let showMenu = false;
  function toggleMenu() {
    showMenu = !showMenu;
  }
  function handleBackgroundKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleMenu();
    }
  }

  /* =====================
   * 3) 로그인 사용자의 저장된 돌 불러오기
   * ===================== */
  async function loadUserStone() {
    // if (localStorage.getItem('skipLoadUserStone')) {
    //   localStorage.removeItem('skipLoadUserStone');
    //   return;
    // }
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error("세션 로드 실패:", sessionError);
      return;
    }
    if (sessionData?.session?.user) {
      const userId = sessionData.session.user.id;
      
      // 프로필에서 current_stone_id 조회
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('current_stone_id')
        .eq('id', userId)
        .single();
      if (profileError || !profile) {
        console.error("프로필 조회 실패:", profileError);
        await drawStoneAndSetCurrent();
        return;
      }
      if (!profile.current_stone_id) {
        await drawStoneAndSetCurrent();
        return;
      }
      
      // 프로필의 current_stone_id를 기준으로 돌 정보를 불러옴
      const { data: stoneData, error: stoneError } = await supabase
        .from('stones')
        .select('*')
        .eq('id', profile.current_stone_id)
        .single();
      if (stoneError || !stoneData) {
        console.error("현재 돌 조회 실패:", stoneError);
        await drawStoneAndSetCurrent();
        return;
      }
      const loadedStone = {
        id: stoneData.id,
        type: stoneData.type,
        baseSize: stoneData.size,
        totalElapsed: stoneData.totalElapsed || 0,
        name: stoneData.name,
        last_updated: stoneData.last_updated || new Date().toISOString()
      };
      currentStone.set(loadedStone);
      computedSize = loadedStone.baseSize;
    }
  }

  async function drawStoneAndSetCurrent() {
    const lockKey = 'stoneCreationLock';
    const pendingKey = 'stoneCreationInProgress';

    // 이미 돌 생성이 진행 중이라면 pendingKey 체크
    if (localStorage.getItem(pendingKey)) {
      console.log('돌 생성 작업이 이미 진행 중입니다. 대기 후 재시도');
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 대기 후
      return loadUserStone();
    }

    // pending 플래그 설정 (진행 중임을 표기)
    localStorage.setItem(pendingKey, 'true');
  
    console.log('drawStoneAndSetCurrent 실행');
    // 이미 돌 생성 중이면, 돌 정보를 다시 불러오도록 대기합니다.
    if (localStorage.getItem(lockKey)) {
      console.log('락 대기 중');
      // 락이 해제될 때까지 100ms 간격으로 체크
      await new Promise(resolve => {
        const checkLock = setInterval(() => {
          if (!localStorage.getItem(lockKey)) {
            clearInterval(checkLock);
            resolve(null);
          }
        }, 100);
      });
      return loadUserStone();
    }
    // 돌 생성 시작 전 락 설정
    localStorage.setItem(lockKey, 'true');
    console.log('락 설정');
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error("세션 로드 실패:", sessionError);
      localStorage.removeItem(lockKey);
      localStorage.removeItem(pendingKey);
      return;
    }
    if (!sessionData?.session?.user) {
      console.error("로그인된 사용자가 없습니다.");
      localStorage.removeItem(lockKey);
      localStorage.removeItem(pendingKey);
      return;
    }
    const userId = sessionData.session.user.id;
    
    const randomType = getRandomStoneType();
    const newStone = {
      id: crypto.randomUUID(),
      type: randomType,
      size: 1,
      name: randomType,
      discovered_at: new Date().toISOString(),
      user_id: userId,
      totalElapsed: 0
    };
    console.log('newStone 생성');
    const { data, error } = await supabase.from('stones').insert(newStone).select();
    
    if (error) {
      console.error("돌 뽑기 실패:", error);
      localStorage.removeItem(lockKey);
      localStorage.removeItem(pendingKey);
    } else if (data && data.length > 0) {
      const createdStone = data[0];
      currentStone.set({
        id: createdStone.id,
        type: createdStone.type,
        baseSize: createdStone.size,
        totalElapsed: createdStone.totalElapsed || 0,
        name: createdStone.name,
        last_updated: createdStone.last_updated || new Date().toISOString()
      });
      computedSize = createdStone.size;
      console.log('currentStone 설정');
      // 프로필 업데이트: 새로 생성된 돌의 id를 current_stone_id에 저장
      console.log('프로필 업데이트 시작');
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ current_stone_id: createdStone.id })
        .eq('id', userId);
      if (profileError) {
        console.error("프로필 업데이트 실패:", profileError);
      }
      // 돌 획득 기록 추가
      await recordAcquiredStone(createdStone.type);
      // 락 해제
      localStorage.removeItem(lockKey);
      localStorage.removeItem(pendingKey);
    }
  }

  /* =====================
   * 4) 돌 성장 및 자동 저장 로직
   * ===================== */
  async function autoUpdateStone() {
    const currentSession = get(session);
    if (!currentSession || !currentSession.user) {
      console.error("로그인된 사용자가 없습니다.");
      return;
    }
    const userId = currentSession.user.id;
    const stone = get(currentStone);
    const updateData: any = {
      id: stone.id,
      type: stone.type,
      size: stone.baseSize,
      totalElapsed: stone.totalElapsed,
      user_id: userId,
      last_updated: new Date().toISOString()
    };
    // 수동 편집으로 이름이 변경된 경우, autoUpdate에서는 돌 이름을 덮어쓰지 않습니다.
    if (!stone.manualEdit) {
      updateData.name = stone.name;
    }
    sendStoneUpdate(updateData);
  }

  /* =====================
   * 5) 경험치(xp) 업데이트 함수 (돌 업데이트와 동일한 구조)
   * ===================== */
  async function autoUpdateUserXp(elapsedSeconds: number) {
    const currentSession = get(session);
    if (!currentSession || !currentSession.user) {
      console.error("로그인된 사용자가 없습니다.");
      return;
    }
    const userId = currentSession.user.id;
    // xp는 경과 초만큼 증가
    userXp += elapsedSeconds;
    
    // CSV 데이터(userXpData)를 활용해 xp 기반 레벨 계산
    if (data.userXpData && data.userXpData.length > 0) {
      const calcResult = calculateLevel(userXp, data.userXpData);
      userLevel = calcResult.level;
    }
    
    // sendXpUpdate 함수는 기존 delta를 사용하는 타입으로 선언되어 있을 수 있으므로,
    // 새로운 구조의 update 데이터를 전달할 때 any 캐스팅을 사용합니다.
    sendXpUpdate({ 
      userId, 
      xp: userXp, 
      level: userLevel, 
      last_updated: new Date().toISOString() 
    } as any);
    console.log("websocket에 xp 업데이트 요청 전송:", { userId, xp: userXp, level: userLevel });
  }

  /* =====================
   * 6) 타이머 관련 DB 연동 함수 (profiles.remaining_time 사용)
   * ===================== */
  async function loadRemainingTime(): Promise<number | null> {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error("세션 로드 실패:", sessionError);
      return null;
    }
    if (!sessionData?.session?.user) {
      console.error("로그인된 사용자가 없습니다.");
      return null;
    }
    const userId = sessionData.session.user.id;
    const { data, error } = await supabase
      .from('profiles')
      .select('remaining_time')
      .eq('id', userId)
      .single();
    if (error) {
      console.error("남은 시간 불러오기 실패:", error);
      return null;
    }
    return data.remaining_time;
  }

  async function updateRemainingTime(newTime: number) {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error("세션 로드 실패 (update remaining time):", sessionError);
      return;
    }
    if (!sessionData?.session?.user) {
      console.error("로그인된 사용자가 없습니다. (update remaining time)");
      return;
    }
    const userId = sessionData.session.user.id;
    const { error } = await supabase
      .from('profiles')
      .update({ remaining_time: newTime })
      .eq('id', userId);
    if (error) {
      console.error("남은 시간 업데이트 실패:", error);
    }
  }

  // ── 추가: 자금(balance) 불러오기 함수 ──────────────────────────────
  async function loadBalance(): Promise<void> {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error("세션 로드 실패 (balance):", sessionError);
      return;
    }
    if (!sessionData?.session?.user) {
      console.error("로그인된 사용자가 없습니다. (balance)");
      return;
    }
    const userId = sessionData.session.user.id;
    const { data, error } = await supabase
      .from('profiles')
      .select('balance')
      .eq('id', userId)
      .single();
    if (error) {
      console.error("자금 불러오기 실패:", error);
      return;
    }
    balance = data.balance ? Number(data.balance) : 0;
  }

  /* =====================
   * 7) onMount - 돌 성장, 타이머, 출석 체크 로직
   * ===================== */
  // 기존 supabase 실시간 채널 구독 코드는 웹소켓 업데이트만 사용하기 위해 제거하였습니다.
  let stonesSubscription; // 더 이상 사용하지 않음

  onMount(() => {
    // 페이지 진입 시, 이전에 남아 있을 수 있는 stoneCreationLock를 제거합니다.
    localStorage.removeItem('stoneCreationLock');
    localStorage.removeItem('stoneCreationInProgress');
    console.log('페이지 로드 시 stoneCreationLock 초기화 완료');
    loadUserStone();
    loadUserXpData();
    // 기존 비동기 초기화 작업 호출 (checkAttendance, loadBalance, loadRemainingTime 등)
    (async () => {
      (async () => {
        const attendanceRes = await checkAttendance();
        if (attendanceRes.message) {
          attendanceMsg = get(t)(attendanceRes.message);
          setTimeout(() => {
            attendanceMsg = "";
          }, 3000);
        }
        await loadBalance();
      })();
      (async () => {
        const dbRemaining = await loadRemainingTime();
        if (dbRemaining === null || dbRemaining <= 0) {
          countdown = 3600;
          updateRemainingTime(3600);
        } else {
          countdown = dbRemaining;
        }
      })();
    })();

    // ── requestAnimationFrame을 이용한 업데이트 루프 시작 ────────────────────────
    let lastUpdateTime = performance.now();
    let animationFrameId: number;
    // 신규로 추가된 변수들 (돌 뽑기 관련)
    let isDrawing = false;
    let pendingDraws = 0;
    const drawPeriod = 3600; // 돌 뽑기 주기 (초)

    function updateLoop(currentTime: number) {
      const elapsedTime = currentTime - lastUpdateTime;
      const elapsedSeconds = Math.floor(elapsedTime / 1000);
      if (elapsedSeconds > 0) {
        // 돌 성장 및 경험치 업데이트 처리
        currentStone.update((stone) => {
          let newSize = stone.baseSize;
          let newTotalElapsed = stone.totalElapsed || 0;
          for (let i = 0; i < elapsedSeconds; i++) {
            const deltaX = growthFactor * Math.log((newTotalElapsed + 2) / (newTotalElapsed + 1));
            const randomFactor = 0.4 * Math.random() + 0.8;
            newSize += deltaX * randomFactor;
            newTotalElapsed++;
          }
          computedSize = newSize;
          return { ...stone, baseSize: newSize, totalElapsed: newTotalElapsed };
        });
  
        autoUpdateStone();
        autoUpdateUserXp(elapsedSeconds);
  
        // 타이머 업데이트 및 돌 뽑기 로직 개선
        if (elapsedSeconds < countdown) {
          countdown -= elapsedSeconds;
          updateRemainingTime(countdown);
        } else {
          let remainingAfterCycle = elapsedSeconds - countdown;
          // 최초 countdown까지 1회 draw, 이후 drawPeriod마다 추가 draw 발생
          let drawsDue = 1 + Math.floor(remainingAfterCycle / drawPeriod);
          pendingDraws += drawsDue;
          let remainder = remainingAfterCycle % drawPeriod;
          countdown = drawPeriod - remainder;
          updateRemainingTime(countdown);
        }
  
        lastUpdateTime = currentTime;
      }
  
      // pendingDraws가 있을 경우 순차적으로 돌 뽑기 실행
      if (!isDrawing && pendingDraws > 0) {
        processPendingDraws();
      }
  
      animationFrameId = requestAnimationFrame(updateLoop);
    }
  
    async function processPendingDraws() {
      if (isDrawing) return;
      isDrawing = true;
      while (pendingDraws > 0) {
        pendingDraws--;
        await drawStone();
      }
      isDrawing = false;
    }
  
    animationFrameId = requestAnimationFrame(updateLoop);
  
    // SPA 내에서 페이지 이동 시에도 최종 저장을 진행 (비동기 저장)
    beforeNavigate(async () => {
      console.log("페이지 이동 전 최종 업데이트 시작");
      // 즉각 업데이트를 통해 현재 상태를 직접 DB에 저장
      await immediateStoneUpdate();
      await immediateXpUpdate();
      // // 동시에 기존에 쌓인 업데이트(웹소켓용)를 플러시 처리
      // await flushStoneUpdates();
      // 메시지 큐도 비워줍니다.
      clearLocalMessageQueue();
      console.log("페이지 이동 전 최종 업데이트 완료");
    });

    // 웹소켓 업데이트만 사용하므로 supabase 리얼타임 채널 구독은 제거되었습니다.
  
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  });

  /* 사용하지 않는 함수: setupMidnightCheck
  function setupMidnightCheck() {
    // 한국 시간 기준 다음 자정까지 남은 시간 계산
    const now = new Date();
    const kstNow = new Date(now.getTime());
    kstNow.setHours(kstNow.getHours() + 9); // UTC+9
    const tomorrow = new Date(kstNow);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    // 다음 자정까지 남은 밀리초
    const timeUntilMidnight = tomorrow.getTime() - kstNow.getTime();
    
    setTimeout(async () => {
      // console.log('자정 출석 체크 실행');
      const attendanceRes = await checkAttendance();
      if (attendanceRes.message) {
        attendanceMsg = get(t)(attendanceRes.message);
        setTimeout(() => {
          attendanceMsg = "";
        }, 3000);
        await loadBalance();
      }
      
      // 다음 자정을 위한 체크 설정
      setupMidnightCheck();
    }, timeUntilMidnight);
  }
  */

  // 즉각 DB 업데이트 함수 (WS를 사용하지 않고 직접 supabase API를 호출)
  async function immediateStoneUpdate() {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error("세션 가져오기 실패:", sessionError);
      return;
    }
    if (!sessionData?.session?.user) {
      console.error("로그인된 사용자가 없습니다.");
      return;
    }
    const userId = sessionData.session.user.id;
    const stone = get(currentStone);
    const updateData = {
      id: stone.id,
      type: stone.type,
      size: stone.baseSize,
      totalElapsed: stone.totalElapsed,
      user_id: userId,
      last_updated: new Date().toISOString(),
      name: stone.name
    };
    const { error } = await supabase
      .from('stones')
      .upsert(updateData);
    if (error) {
      console.error("즉각 DB 업데이트 실패:", error);
    } else {
      console.log("즉각 DB 업데이트 성공");
    }
  }

  // 즉각 XP 업데이트 함수 (페이지 이동 등 시 호출)
  async function immediateXpUpdate() {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error("세션 가져오기 실패 (xp 업데이트):", sessionError);
      return;
    }
    if (!sessionData?.session?.user) {
      console.error("로그인된 사용자가 없습니다. (xp 업데이트)");
      return;
    }
    const userId = sessionData.session.user.id;
    const xpUpdateData = {
      userId,
      xp: userXp,
      level: userLevel,
      last_updated: new Date().toISOString()
    };
    // 최신 XP 및 레벨 정보를 서버에 전송하여 업데이트 플러시
    console.log("즉각 XP 업데이트 요청 전송:", xpUpdateData);
    const { error } = await supabase
      .from('profiles')
      .update({ xp: userXp, level: userLevel })
      .eq('id', userId);
    if (error) {
      console.error("즉각 XP 업데이트 실패:", error);
    } else {
      console.log("즉각 XP 업데이트 성공");
    }
  }

  // 페이지 이동 전, 돌 업데이트와 XP 업데이트를 모두 진행하고 메시지 큐를 비웁니다.
  beforeNavigate(async () => {
    console.log("페이지 이동 전 즉각 업데이트 시작");
    await immediateStoneUpdate();
    await immediateXpUpdate();
    clearLocalMessageQueue();
    console.log("페이지 이동 전 즉각 업데이트 완료");
  });

  // 예시: 로그아웃 시 직접 DB 업데이트 후, 로컬 pending 메시지 삭제
  async function logout() {
    console.log("로그아웃 시작: 현재 세션 상태", await supabase.auth.getSession());
    // DB 업데이트 및 pending 메시지 삭제를 먼저 수행
    await immediateStoneUpdate();
    clearLocalMessageQueue();

    const { error } = await supabase.auth.signOut();
    if (error) {
      if (error.message === 'Auth session missing!') {
        console.warn("로그아웃 시 이미 세션이 만료되었습니다.");
      } else {
        console.error("로그아웃 실패:", error.message);
        return;
      }
    }
    // 로그아웃 후 세션 상태 확인
    const { data: sessionAfter } = await supabase.auth.getSession();
    console.log("로그아웃 후 세션 상태", sessionAfter);

    // 세션 스토어와 localStorage 초기화
    session.set(null);
    localStorage.removeItem('activeSession');

    // 강제 페이지 새로고침을 통해 캐시를 확실히 비움 (필요 시 주석 해제)
    goto('/login');
    // location.reload();
  }

  async function saveStone() {
    // 더 이상 사용하지 않을 저장 기능
  }

  async function drawStone() {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error("세션 로드 실패:", sessionError);
      return;
    }
    if (!sessionData?.session?.user) {
      console.error("로그인된 사용자가 없습니다.");
      return;
    }
    const userId = sessionData.session.user.id;
    
    // 보관함 내 돌 개수 조회 (count가 null일 수 있으므로 처리)
    const { count, error: countError } = await supabase
      .from('stones')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (countError) {
      console.error("보관함의 돌 개수 조회 실패:", countError);
      return;
    }
    const currentCount = count ?? 0;  // count가 null이면 0으로 간주함
    
    // 프로필에서 storage_limit 값을 조회
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('storage_limit')
      .eq('id', userId)
      .single();
    if (profileError || !profile) {
      console.error("프로필 정보 불러오기 실패:", profileError);
      return;
    }
    const storageLimit = profile.storage_limit;
    
    // 보관함이 가득 찼으면 새로운 돌 생성하지 않음
    if (currentCount >= storageLimit) {
      console.log("보관함이 가득 찼습니다. 새로운 돌 생성 중단");
      return;
    }
    
    // 보관함에 여유가 있을 때만 돌 생성 로직 진행
    const randomType = getRandomStoneType();
    const newStone = {
      id: crypto.randomUUID(),
      type: randomType,
      size: 1,
      name: randomType,
      discovered_at: new Date().toISOString(),
      user_id: userId,
      totalElapsed: 0
    };
    const { data, error } = await supabase.from('stones').insert(newStone).select();
    if (error) {
      console.error("돌 뽑기 실패:", error);
    } else {
      await recordAcquiredStone(randomType);
    }
  }

  function handleShare(): void {
    navigator.clipboard.writeText(window.location.href)
      .then(() => {
        copyMessage = $t('linkCopied');
        setTimeout(() => {
          copyMessage = "";
        }, 3000);
      })
      .catch((err) => console.error("Failed to copy link:", err));
  }

  // 이미지 에러 핸들러 추가
  function handleImageError(e: Event) {
    const imgElement = e.target as HTMLImageElement;
    imgElement.src = getDefaultImagePath();
    imgElement.onerror = null; // 무한 루프 방지
  }

  // DB 업데이트가 반영되었는지 확인하기 위해 폴링하는 함수
  async function waitForDBUpdate(stoneId: string, expectedTimestamp: string, timeout = 5000, interval = 500): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const { data, error } = await supabase
        .from('stones')
        .select('last_updated')
        .eq('id', stoneId)
        .single();

      if (error) {
        console.error('DB 폴링 실패:', error);
      } else if (data) {
        const dbTimestamp = new Date(data.last_updated).getTime();
        const expected = new Date(expectedTimestamp).getTime();
        if (dbTimestamp >= expected) {
          // 예상한 업데이트가 반영됨
          return;
        }
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    console.warn('DB 업데이트 확인 타임아웃');
  }

  // XP 데이터를 불러오는 함수: loadUserStone()과 유사한 구조로 작성합니다.
  async function loadUserXpData() {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error("세션 로드 실패 (xp):", sessionError);
      return;
    }
    if (!sessionData?.session?.user) {
      console.error("로그인된 사용자가 없습니다. (xp)");
      return;
    }
    const userId = sessionData.session.user.id;

    // 프로필 테이블에서 xp, level (및 필요에 따라 last_updated) 컬럼을 조회합니다.
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('xp, level, last_updated')
      .eq('id', userId)
      .single();
    if (profileError || !profile) {
      console.error("프로필 조회 실패 (xp):", profileError);
      return;
    }
    // 불러온 데이터를 전역 변수에 할당
    userXp = profile.xp;
    userLevel = profile.level;
    console.log("XP 데이터 로드 완료:", { userXp, userLevel });
  }
</script>

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
  }
  .background-div {
    position: relative;
    width: 100%;
    min-height: 100vh;
    background-color: #f5f5f5;
    cursor: pointer;
    outline: none;
  }
  .background-div:focus {
    outline: 2px solid #aaa;
  }
  .stone-info {
    max-width: 600px;
    margin: 0 auto;
    text-align: center;
    padding: 2rem 1rem;
  }
  .stone-image-wrapper {
    margin-top: 10vh;
    display: flex;
    justify-content: center;
  }
  .stone-img {
    width: 200px;
    height: auto;
    transition: transform 0.3s ease-in-out;
    position: relative;
    z-index: 0;
  }
  .stone-text {
    margin-top: 1rem;
  }
  p {
    margin: 0.5rem 0;
  }
  .btn {
    padding: 0.5rem 1rem;
    color: #000;
    background-color: #B7DDBF;
    border: 1px solid #DDDDDD;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.3s;
    margin: 0.5rem;
  }
  .btn:hover {
    background-color: #A3CBB1;
  }
  .menu-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    background: #fff;
    box-shadow: 0 2px 6px rgba(0,0,0,0.2);
    padding: 1rem;
    animation: fadeDown 0.3s ease forwards;
    z-index: 9;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .menu-group.help-group {
    order: 1;
    gap: 0.25rem;
  }
  .menu-group.storage-group {
    order: 2;
  }
  .menu-group {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
  }
  @media (min-width: 600px) {
    .menu-overlay {
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
    }
    .menu-group.storage-group {
      order: 1;
    }
    .menu-group.help-group {
      order: 2;
    }
  }
  @keyframes fadeDown {
    0% {
      opacity: 0;
      transform: translateY(-20px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }
  .stone-name {
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    font-size: 2rem;
    font-weight: bold;
    text-align: center;
    cursor: pointer;
    position: relative;
    z-index: 1;
  }
  .btn.logout-btn {
    background-color: #F88A87;
  }
  .btn.logout-btn:hover {
    background-color: #E27675;
  }
  .icon-btn {
    padding: 0.25rem 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #fff !important;
  }
  .icon-btn img {
    display: block;
    width: 20px;
    height: 20px;
  }
  .btn.icon-btn {
    border: none !important;
  }
  .menu-group.help-group .btn {
    margin: 0.1rem;
  }
  .icon-text-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 60px;
    height: 60px;
    background-color: #fff;
    margin: 0.1rem;
    border: 1px solid #CCC;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.3s;
    box-sizing: border-box;
  }
  .icon-text-btn:hover {
    background-color: #f7f7f7;
  }
  .icon-text-btn img {
    display: block;
    width: 34px;
    height: 34px;
  }
  .btn-label {
    font-size: 0.8rem;
    margin-top: 0.25rem;
    color: #000;
  }
  .btn.icon-text-btn {
    padding: 0.1rem !important;
  }
  .copy-message {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    z-index: 1000;
    font-size: 0.9rem;
  }
  /* ── 자금(스톤) 표시 영역 스타일 수정 (회색 배경, 영역 높이 감소) ───────────────────────── */
  .balance-display {
    display: inline-flex;
    align-items: center;
    margin-left: 0.5rem;
    background: #fff;
    padding-right: 0.5rem;
    padding-left: 0.5rem;
    margin-top: 1.0rem;
    margin-bottom: 1.0rem;
    border-radius: 20px;
    border: 1px solid #ccc;
    line-height: 1;
  }
  .balance-icon {
    width: 2rem;
    height: 2rem;
    margin-right: 0.2rem;
  }
  .balance-display span {
    font-size: 1.0rem;
    line-height: 1;
  }
  /* 좁은 화면에서는 자금 표시 영역은 전체 너비로 내려옴 */
  @media (max-width: 600px) {
    .menu-group.storage-group {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
      justify-content: center;
    }
    .menu-group.storage-group button {
      flex: 0 0 auto;
    }
    .menu-group.storage-group .balance-display {
      flex-basis: 40%;
      display: flex;
      justify-content: center;
      margin-top: 0.5rem;
    }
  }
  /* 돌 사이즈 토글에 사용할 스타일 */
  .detailed-size-toggle {
    cursor: pointer;
    text-decoration: none;
    position: relative;
    z-index: 1;
  }
</style>

<div
  class="background-div"
  role="button"
  aria-label="Toggle menu"
  tabindex="0"
  on:click={toggleMenu}
  on:keydown={handleBackgroundKeydown}>
  <div class="stone-info" role="presentation">
    <div class="stone-image-wrapper">
      <img
        class="stone-img"
        src={getStoneImagePath($currentStone.type)}
        alt={$currentStone.name}
        style="transform: scale({1 + (computedSize - 1) * 0.1});"
        on:error={handleImageError}
      />
    </div>
    <div class="stone-text">
      <button
        class="stone-name"
        type="button"
        on:click|stopPropagation
        on:dblclick|stopPropagation={editStoneName}
        on:keydown|stopPropagation={(e) => { if (e.key === 'Enter' || e.key === ' ') editStoneName(); }}>
        {$currentStone.name}
      </button>
      <p>
        {$t('sizeLabel')}: 
        <span
          role="button"
          tabindex="0"
          class="detailed-size-toggle"
          on:click|stopPropagation|preventDefault={() => { detailedSizeShown = !detailedSizeShown; }}
          on:keydown|stopPropagation|preventDefault={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              detailedSizeShown = !detailedSizeShown;
            }
          }}>
          {detailedSizeShown ? computedSize.toFixed(15) : computedSize.toFixed(4)}
        </span>
      </p>
      <p>{$t('typeLabel')}: {$t('stoneTypes.' + $currentStone.type)}</p>
      <p>{$t('totalGrowthTimeLabel')}: {$currentStone.totalElapsed || 0}s</p>
      <p>{$t('nextStoneInLabel')}: {formatTime(countdown)}</p>
    </div>
  </div>
  {#if showMenu}
    <div class="menu-overlay" role="dialog" aria-modal="true" aria-label="Menu">
      <div class="menu-group storage-group">
        <button class="btn icon-text-btn" on:click={() => goto('/storage')}>
          <img src="/assets/icons/storage.png" alt="{$t('storage')}" />
          <span class="btn-label">{$t('storage')}</span>
        </button>
        <button class="btn icon-text-btn" on:click={() => goto('/profile')}>
          <img src="/assets/icons/profile.png" alt="{$t('profile')}" />
          <span class="btn-label">{$t('profile')}</span>
        </button>
        <button class="btn icon-text-btn" on:click={() => goto('/catalog')}>
          <img src="/assets/icons/catalog.png" alt="{$t('catalog')}" />
          <span class="btn-label">{$t('catalog')}</span>
        </button>
        <button class="btn icon-text-btn" on:click={() => goto('/market')}>
          <img src="/assets/icons/market.png" alt="{$t('market.label')}" />
          <span class="btn-label">{$t('market.label')}</span>
        </button>
        <div class="balance-display">
          <img
            src="/assets/icons/stone.png"
            alt={$t('stone')}
            class="balance-icon"
            title={$t('stone')}
          />
          <span>{balance.toLocaleString()}</span>
        </div>
      </div>
      <div class="menu-group help-group">
        <button class="btn icon-btn" title="{$t('share')}" aria-label="{$t('share')}" on:click={handleShare}>
          <img src="/assets/icons/share.png" alt="{$t('share')}" />
        </button>
        <button class="btn icon-btn" on:click={() => goto('/notice')} title="{$t('notice')}" aria-label="{$t('notice')}">
          <img src="/assets/icons/notice.png" alt="{$t('notice')}" />
        </button>
        <button class="btn icon-btn" on:click={() => goto('/help')} title="{$t('help')}" aria-label="{$t('help')}">
          <img src="/assets/icons/help.png" alt="{$t('help')}" />
        </button>
        <button class="btn icon-btn" on:click={() => goto('/settings')} title="{$t('settings')}" aria-label="{$t('settings')}">
          <img src="/assets/icons/settings.png" alt="{$t('settings')}" />
        </button>
        <button class="btn logout-btn" on:click={logout}>{$t('logout')}</button>
      </div>
    </div>
  {/if}
</div>

{#if copyMessage}
  <div class="copy-message">{copyMessage}</div>
{/if}

{#if attendanceMsg}
  <div class="copy-message">{attendanceMsg}</div>
{/if}