<script lang="ts">
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { goto } from '$app/navigation';
  import { currentStone } from '$lib/stoneStore';
  import { get } from 'svelte/store';
  import { t } from 'svelte-i18n';
  import type { RealtimeChannel } from '@supabase/supabase-js';
  import { updateUserXp } from '$lib/xpUtils';
  import { recordAcquiredStone } from '$lib/stoneCatalogUtils';
  import { checkAttendance } from '$lib/attendanceUtils';
  import { getStoneImagePath, getDefaultImagePath } from '$lib/imageUtils';

  /* =====================
   * 1) 돌 정보 & 성장 로직
   * ===================== */
  const growthFactor = 1.0; // k 값
  const stoneTypes = [
    'andesite',
    'basalt',
    'conglomerate',
    'gneiss',
    'granite',
    'limestone',
    'quartzite',
    'sandstone',
    'shale',
    'tuff'
  ];

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

  function randomizeStone() {
    const randomType = stoneTypes[Math.floor(Math.random() * stoneTypes.length)];
    currentStone.update((stone) => ({
      ...stone,
      type: randomType,
      baseSize: 1,
      totalElapsed: 0,
      name: randomType
    }));
  }

  // 돌 이름 수정 함수 (번역 적용)
  function editStoneName() {
    const stone = get(currentStone);
    const translate = get(t);
    const newName = prompt(translate('changeStoneNamePrompt'), stone.name);
    if (newName && newName.trim() !== '') {
      currentStone.set({ ...stone, name: newName });
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
    if (localStorage.getItem('skipLoadUserStone')) {
      localStorage.removeItem('skipLoadUserStone');
      return;
    }
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error("세션 로드 실패:", sessionError);
      return;
    }
    if (sessionData?.session?.user) {
      const userId = sessionData.session.user.id;
      const { data: stoneData, error: stoneError } = await supabase
        .from('stones')
        .select('*')
        .eq('user_id', userId)
        .order('discovered_at', { ascending: false })
        .limit(1);
      if (stoneError) {
        console.error("저장된 돌 불러오기 실패:", stoneError);
      } else if (stoneData && stoneData.length > 0) {
        const stoneRecord = stoneData[0];
        const loadedStone = {
          id: stoneRecord.id,
          type: stoneRecord.type,
          baseSize: stoneRecord.size,
          totalElapsed: stoneRecord.totalElapsed || 0,
          name: stoneRecord.name
        };
        currentStone.set(loadedStone);
        computedSize = loadedStone.baseSize;
      } else {
        // 저장된 돌이 없으면 drawStone을 호출하여 새 돌을 뽑아 currentStone에 설정
        await drawStoneAndSetCurrent();
      }
    }
  }

  async function drawStoneAndSetCurrent() {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error("세션 로드 실패:", sessionError);
      return;
    }
    if (!sessionData?.session?.user) {
      console.error("로그인된 사용자가 없습니다.");
      return;
    }
    const randomType = stoneTypes[Math.floor(Math.random() * stoneTypes.length)];
    const newStone = {
      id: crypto.randomUUID(),
      type: randomType,
      size: 1,
      name: randomType,
      discovered_at: new Date().toISOString(),
      user_id: sessionData.session.user.id,
      totalElapsed: 0
    };

    const { data, error } = await supabase.from('stones').insert(newStone).select();
    if (error) {
      console.error("돌 뽑기 실패:", error);
    } else if (data && data.length > 0) {
      const createdStone = data[0];
      currentStone.set({
        id: createdStone.id,
        type: createdStone.type,
        baseSize: createdStone.size,
        totalElapsed: createdStone.totalElapsed || 0,
        name: createdStone.name
      });
      computedSize = createdStone.size;

      // acquired_stones 테이블에도 기록
      await recordAcquiredStone(createdStone.type);
    }
  }

  /* =====================
   * 4) 돌 성장 및 자동 저장 로직
   * ===================== */
  async function autoUpdateStone() {
    const stone = get(currentStone);
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
    const { error } = await supabase.from('stones').upsert({
      id: stone.id,
      type: stone.type,
      size: stone.baseSize,
      totalElapsed: stone.totalElapsed || 0,
      name: stone.name,
      discovered_at: new Date().toISOString(),
      user_id: userId
    });
    if (error) {
      console.error("자동 저장 실패:", error);
    }
  }

  /* =====================
   * 5) 타이머 관련 DB 연동 함수 (profiles.remaining_time 사용)
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
   * 6) onMount - 돌 성장, 타이머, 출석 체크 로직
   * ===================== */
  let stonesSubscription: RealtimeChannel;

  onMount(() => {
    loadUserStone();

    // 출석 체크 후 다국어 메시지를 인스턴스 메시지로 표시
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

    // DB에서 남은 시간을 로드. 값이 없거나 0 이하이면 3600초(1시간)로 초기화.
    (async () => {
      const dbRemaining = await loadRemainingTime();
      if (dbRemaining === null || dbRemaining <= 0) {
        countdown = 3600;
        updateRemainingTime(3600);
      } else {
        countdown = dbRemaining;
      }
    })();

    // 1초마다 돌 성장, xp 업데이트, 타이머 감소 로직
    const timer = setInterval(() => {
      currentStone.update((stone) => {
        const oldElapsed = stone.totalElapsed || 0;
        const deltaX = growthFactor * Math.log((oldElapsed + 2) / (oldElapsed + 1));
        const randomFactor = 0.4 * Math.random() + 0.8;
        const newSize = stone.baseSize + deltaX * randomFactor;
        computedSize = newSize;
        return { ...stone, baseSize: newSize, totalElapsed: oldElapsed + 1 };
      });
      autoUpdateStone();
      updateUserXp();

      if (countdown > 0) {
        countdown--;
        updateRemainingTime(countdown);
        if (countdown <= 0) {
          // 시간이 다 되면 새 돌 뽑기 후 타이머 리셋
          drawStone().then(() => {
            countdown = 3600;
            updateRemainingTime(3600);
          });
        }
      }
    }, 1000);

    // 자정 체크 타이머 설정 - setInterval 밖으로 이동
    setupMidnightCheck();

    // Supabase realtime 채널 구독 (현재 돌 업데이트)
    const stoneId = get(currentStone).id;
    stonesSubscription = supabase
      .channel('stone-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'stones',
          filter: `id=eq.${stoneId}`
        },
        (payload: any) => {
          console.log('실시간 돌 업데이트:', payload);
          const updatedStone = payload.new;
          if (updatedStone.id === stoneId) {
            currentStone.set({
              id: updatedStone.id,
              type: updatedStone.type,
              baseSize: updatedStone.size,
              totalElapsed: updatedStone.totalElapsed || 0,
              name: updatedStone.name
            });
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(timer);
      supabase.removeChannel(stonesSubscription);
    };
  });

  // 자정에 자동으로 출석 체크를 수행하는 함수 - setInterval 외부로 이동
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
    
    console.log(`다음 출석 체크까지: ${Math.floor(timeUntilMidnight / 1000 / 60)}분`);
    
    setTimeout(async () => {
      console.log('자정 출석 체크 실행');
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

  async function logoutHandler() {
    const sessionResponse = await supabase.auth.getSession();
    if (!sessionResponse.data.session) {
      console.log("현재 활성화된 세션이 없습니다. 이미 로그아웃 상태입니다.");
      goto('/login');
      return;
    }

    const { error } = await supabase.auth.signOut();
    if (error) {
      if (error.message === "Auth session missing!") {
        console.log("세션이 이미 만료되었거나 존재하지 않습니다. 로그인 페이지로 이동합니다.");
        goto('/login');
        return;
      }
      console.error("로그아웃 실패:", error.message);
    } else {
      console.log("로그아웃 성공");
      goto('/login');
    }
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
    const randomType = stoneTypes[Math.floor(Math.random() * stoneTypes.length)];
    const newStone = {
      id: crypto.randomUUID(),
      type: randomType,
      size: 1,
      name: randomType,
      discovered_at: new Date().toISOString(),
      user_id: sessionData.session.user.id,
      totalElapsed: 0
    };
    const { data, error } = await supabase.from('stones').insert(newStone).select();
    if (error) {
      console.error("돌 뽑기 실패:", error);
    } else {
      console.log("돌 뽑기 성공:", data);
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
          <img src="/assets/icons/market.png" alt="{$t('market')}" />
          <span class="btn-label">{$t('market')}</span>
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
        <button class="btn icon-btn" on:click={() => goto('/help')} title="{$t('help')}" aria-label="{$t('help')}">
          <img src="/assets/icons/help.png" alt="{$t('help')}" />
        </button>
        <button class="btn icon-btn" on:click={() => goto('/settings')} title="{$t('settings')}" aria-label="{$t('settings')}">
          <img src="/assets/icons/settings.png" alt="{$t('settings')}" />
        </button>
        <button class="btn logout-btn" on:click={logoutHandler}>{$t('logout')}</button>
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