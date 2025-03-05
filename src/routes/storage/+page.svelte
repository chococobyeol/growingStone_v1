<script lang="ts">
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { goto } from '$app/navigation';
  import { currentStone } from '$lib/stoneStore';
  import { get } from 'svelte/store';
  import { t } from 'svelte-i18n';
  import type { RealtimeChannel } from '@supabase/supabase-js';
  import { showDeleteWarning } from '$lib/settingsStore';
  import { getStoneImagePath, getDefaultImagePath } from '$lib/imageUtils';

  // DB에 저장된 돌 데이터 타입 (DB의 size는 현재 돌의 baseSize에 해당)
  type Stone = {
    id: string;
    type: string;
    size: number;
    discovered_at: string;
    name: string;
    totalElapsed?: number;
    market_listings?: { id: string; status: string }[];
  };

  let storedStones: Stone[] = [];
  let errorMsg = '';
  let stonesSubscription: RealtimeChannel;

  // 각 돌의 상세 사이즈 표시 여부를 관리하는 객체
  let detailedSizeStates: Record<string, boolean> = {};

  // 보관함 슬롯 수 (프로필에 저장된 사용자의 보관함 슬롯 수)
  let storageLimit = 0;
  // 기본 보관함 슬롯 수 (초기값). 필요에 따라 수정 가능.
  const BASE_STORAGE_LIMIT = 100;

  function toggleDetailedSize(id: string) {
    detailedSizeStates = { ...detailedSizeStates, [id]: !detailedSizeStates[id] };
  }

  // 이미지 에러 핸들러 추가
  function handleImageError(e: Event) {
    const imgElement = e.target as HTMLImageElement;
    imgElement.src = getDefaultImagePath();
    imgElement.onerror = null; // 무한 루프 방지
  }

  async function loadStoredStones() {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error("세션을 가져오는 데 실패했습니다:", sessionError.message);
      errorMsg = sessionError.message;
      return;
    }
    const user = sessionData?.session?.user;
    if (!user) {
      errorMsg = "로그인된 사용자가 없습니다.";
      return;
    }
    
    const { data, error } = await supabase
      .from('stones')
      .select('*, market_listings!left(id, status)')
      .eq('user_id', user.id)
      .order('discovered_at', { ascending: false });
    if (error) {
      console.error('스톤 데이터 가져오기 오류:', error);
      errorMsg = error.message;
    } else {
      storedStones = data || [];
    }
  }

  async function loadStorageLimit() {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session?.user) {
      const userId = sessionData.session.user.id;
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('storage_limit')
        .eq('id', userId)
        .single();
      if (profileError || !profile) {
        errorMsg = '프로필 정보를 불러오는 데 실패했습니다.';
      } else {
        storageLimit = profile.storage_limit;
      }
    }
  }

  async function loadCurrentStone() {
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
      if (profileError || !profile || !profile.current_stone_id) {
        console.error("프로필의 현재 돌 정보 불러오기 실패:", profileError);
        return;
      }
      // current_stone_id를 기준으로 stones 테이블에서 돌의 상세 정보 조회
      const { data: stoneData, error: stoneError } = await supabase
        .from('stones')
        .select('*')
        .eq('id', profile.current_stone_id)
        .single();
      if (stoneError || !stoneData) {
        console.error("현재 돌 조회 실패:", stoneError);
        return;
      }
      // currentStone 스토어 업데이트 (DB 컬럼 size를 baseSize로 사용)
      currentStone.set({
        id: stoneData.id,
        type: stoneData.type,
        baseSize: stoneData.size,
        totalElapsed: stoneData.totalElapsed || 0,
        name: stoneData.name
      });
    }
  }

  // 보관함 확장 기능 구현: 한 칸 확장할 때마다 비용이 발생 (비용 = floor(100 * 1.05^(현재칸수 - 기본칸수)))
  async function expandStorage() {
    // 확장 비용 계산
    const cost = Math.floor(100 * Math.pow(1.05, (storageLimit - BASE_STORAGE_LIMIT)));
    // TS 에러를 피하기 위해 $t의 인자 객체를 사용하지 않고 문자열을 나누어 결합합니다.
    const confirmed = confirm(
      `${$t('expandStorageConfirmPrefix')}${cost.toLocaleString()}${$t('expandStorageConfirmSuffix')}`
    );
    if (!confirmed) return;
    
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData?.session?.user) {
      alert($t('loginRequired'));
      return;
    }
    const userId = sessionData.session.user.id;
    
    // 프로필에서 현재 balance와 storage_limit 조회
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('storage_limit, balance')
      .eq('id', userId)
      .single();
    if (profileError || !profileData) {
      alert($t('profileLoadFailed'));
      return;
    }
    
    if ((profileData.balance ?? 0) < cost) {
      alert($t('insufficientBalance'));
      return;
    }
    
    const newLimit = storageLimit + 1;
    const newBalance = profileData.balance - cost;
    
    const { error } = await supabase
      .from('profiles')
      .update({ storage_limit: newLimit, balance: newBalance })
      .eq('id', userId);
    
    if (error) {
      alert($t('expandStorageFailed') + ": " + error.message);
    } else {
      storageLimit = newLimit;
      alert(
        `${$t('expandStorageSuccessPrefix')}${storageLimit}${$t('expandStorageSuccessMiddle')}${cost.toLocaleString()}${$t('expandStorageSuccessSuffix')}`
      );
    }
  }

  // 불러오기(스왑) 버튼 클릭 시, 현재 돌과 저장된 돌을 서로 교환합니다.
  async function swapStone(stone: Stone) {
    // 마켓에 등록된 돌인지 확인
    if (stone.market_listings && stone.market_listings.length > 0 && 
        stone.market_listings.some(listing => listing.status === 'active')) {
      errorMsg = $t('marketStoneLoadError');
      return;
    }
    
    try {
      const current = get(currentStone);
      const updateForCurrent = {
        type: stone.type,
        size: stone.size,
        name: stone.name,
        totalElapsed: stone.totalElapsed || 0,
        discovered_at: new Date().toISOString()
      };
      const updateForStored = {
        type: current.type,
        size: current.baseSize,
        name: current.name,
        totalElapsed: current.totalElapsed || 0,
        discovered_at: new Date().toISOString()
      };

      // 현재 돌 업데이트
      const { error: errorCurrent } = await supabase
        .from('stones')
        .update(updateForCurrent)
        .eq('id', current.id);
      if (errorCurrent) {
        throw new Error(errorCurrent.message);
      }

      // 선택한 돌 업데이트
      const { error: errorStored } = await supabase
        .from('stones')
        .update(updateForStored)
        .eq('id', stone.id);
      if (errorStored) {
        // 여기서 롤백하는 로직을 추가할 수 있음 (예: 다시 current 돌을 원래대로 복구)
        throw new Error(errorStored.message);
      }

      // 클라이언트 상태 업데이트
      currentStone.set({
        id: stone.id,
        type: stone.type,
        baseSize: stone.size,
        totalElapsed: stone.totalElapsed || 0,
        name: stone.name
      });
      await loadStoredStones();
      goto('/');
    } catch (error) {
      errorMsg = (error as Error).message;
      // 추가: 사용자에게 에러 메시지를 표시하고, 필요시 상태 롤백 처리를 구현
    }
  }

  async function deleteStone(stone: Stone) {
    // 마켓에 등록된 돌인지 확인
    if (stone.market_listings && stone.market_listings.length > 0 && 
        stone.market_listings.some(listing => listing.status === 'active')) {
      errorMsg = $t('marketStoneDeleteError');
      return;
    }
    
    const translate = get(t);
    // 삭제 경고 설정이 true일 경우에만 확인 대화상자를 표시합니다.
    if (get(showDeleteWarning)) {
      if (!confirm(translate('deleteStoneConfirm'))) return;
    }
    try {
      const { error } = await supabase
        .from('stones')
        .delete()
        .eq('id', stone.id);
      if (error) {
        throw new Error(error.message);
      }
      await loadStoredStones();
    } catch (error) {
      errorMsg = (error as Error).message;
      // 에러 발생 시 사용자에게 알림
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      goto('/');
    }
  }

  onMount(() => {
    loadStoredStones();
    loadStorageLimit();
    loadCurrentStone();
    window.addEventListener('keydown', handleKeydown);
    
    supabase.auth.getSession().then(({ data: sessionData, error }) => {
      if (error) {
        console.error("세션을 가져오는 데 실패했습니다:", error.message);
        return;
      }
      const userId = sessionData?.session?.user?.id;
      if (!userId) {
        errorMsg = "로그인된 사용자가 없습니다.";
        return;
      }
      
      // 실시간 구독: 현재 사용자의 stones 테이블 변경 이벤트만 감지
      stonesSubscription = supabase
        .channel('stones-storage')
        .on(
          'postgres_changes',
          { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'stones',
            filter: `user_id=eq.${userId}`
          },
          (payload: any) => {
            console.log('Stone INSERT 이벤트:', payload);
            loadStoredStones();
          }
        )
        .on(
          'postgres_changes',
          { 
            event: 'UPDATE', 
            schema: 'public', 
            table: 'stones',
            filter: `user_id=eq.${userId}`
          },
          (payload: any) => {
            console.log('Stone UPDATE 이벤트:', payload);
            loadStoredStones();
          }
        )
        .on(
          'postgres_changes',
          { 
            event: 'DELETE', 
            schema: 'public', 
            table: 'stones',
            filter: `user_id=eq.${userId}`
          },
          (payload: any) => {
            console.log('Stone DELETE 이벤트:', payload);
            loadStoredStones();
          }
        )
        .subscribe();
    });

    return () => {
      window.removeEventListener('keydown', handleKeydown);
      if (stonesSubscription) {
        supabase.removeChannel(stonesSubscription);
      }
    };
  });
</script>

<div class="storage-container">
  <h1>{$t('storage')}</h1>
  
  {#if errorMsg}
    <p style="color: red;">{errorMsg}</p>
  {/if}
  {#if storedStones.length === 0}
    <p>{$t('noStoredStones')}</p>
  {:else}
    <ul>
      {#each storedStones as stone}
        <li>
          <div class="stone-item">
            <img
              class="stone-img"
              src={getStoneImagePath(stone.type)}
              alt={$t(`stoneTypes.${stone.type}`)}
              on:error={handleImageError}
            />
            <div class="stone-details">
              <p class="details-line">
                <strong style="font-size: 1.2em;">{stone.name}</strong> 
              </p>
              <p class="details-line">
                <strong>{$t('typeLabel')}:</strong> {$t(`stoneTypes.${stone.type}`)}
              </p>
              <p class="details-line">
                <strong>{$t('sizeLabel')}:</strong>
                <span
                  role="button"
                  tabindex="0"
                  class="detailed-size-toggle"
                  on:click|stopPropagation|preventDefault={() => toggleDetailedSize(stone.id)}
                  on:keydown|stopPropagation|preventDefault={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') toggleDetailedSize(stone.id);
                  }}>
                  {detailedSizeStates[stone.id] ? stone.size.toFixed(15) : stone.size.toFixed(4)}
                </span>
              </p>
              <p class="details-line">
                <strong>{$t('totalGrowthTimeLabel')}:</strong> {stone.totalElapsed || 0}s
              </p>
              <p class="details-line">
                <strong>{$t('savedAt')}:</strong> {new Date(stone.discovered_at).toLocaleString()}
              </p>
              {#if stone.id === $currentStone.id}
                <span style="color: green; font-weight: bold;"> {$t('currentStoneTag')}</span>
              {/if}
              {#if stone.market_listings && stone.market_listings.length > 0 && stone.market_listings.some(listing => listing.status === 'active')}
                <span style="color: orange; font-weight: bold;"> {$t('marketRegistered')}</span>
              {/if}
            </div>
          </div>
          <div class="stone-actions">
            {#if stone.id !== $currentStone.id &&
                 !(stone.market_listings && stone.market_listings.length > 0 && stone.market_listings.some(listing => listing.status === 'active'))}
              <button class="swap" on:click={() => swapStone(stone)}>{$t('loadButton')}</button>
              <button class="delete" on:click={() => deleteStone(stone)}>{$t('throwAwayButton')}</button>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  <!-- 보관함 정보 및 확장 UI를 컨테이너 하단에 배치 -->
  <div class="storage-info">
    <p>
      <img src="/assets/icons/storageicon.png" alt="보관함" class="storage-icon" />
      {storedStones.length} / {storageLimit}
    </p>
    <button class="expand-storage-btn" on:click={expandStorage}>
      {$t('expandStorage')}
    </button>
  </div>
</div>

<!-- 뒤로 버튼을 고정 -->
<button class="back-btn" on:click={() => goto('/')}>{$t('backButton')}</button>

<style>
  .storage-container {
    max-width: 600px;
    margin: 2rem auto;
    padding: 1rem;
  }

  h1 {
    text-align: center;
    margin-bottom: 1rem;
  }

  /* 보관함 정보 UI 스타일 (컨테이너 아래쪽에 표시) */
  .storage-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 1rem;
    padding: 0.5rem;
    background-color: #fff;
    border-radius: 8px;
    border: 1px solid #DDD;
  }

  .storage-info p {
    margin: 0;
    font-weight: bold;
  }

  .expand-storage-btn {
    background-color: #B7DDBF;
    color: #000;
    border: 1px solid #ddd;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-weight: normal;
    transition: background-color 0.2s;
  }

  .expand-storage-btn:hover {
    background-color: #A3CBB1;
  }

  ul {
    list-style: none;
    padding: 0;
  }
  li {
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #fff;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
  .stone-item {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .stone-img {
    width: 50px;
    height: 50px;
    object-fit: cover;
    border-radius: 50%;
  }
  .stone-details {
    display: flex;
    flex-direction: column;
  }
  .stone-actions {
    display: flex;
    gap: 1rem;
    align-items: center;
    margin-left: auto;
  }
  /* 모든 버튼에 검은 글자 대신 설정된 색상과, 테두리를 #DDDDDD로 적용 */
  .stone-actions button {
    padding: 0.5rem 1rem;
    color: #000;
    border: 1px solid #DDDDDD;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.3s;
  }
  /* 불러오기 버튼: #B7DDBF, 호버 시 #A3CBB1 */
  .stone-actions button.swap {
    background-color: #B7DDBF;
  }
  .stone-actions button.swap:hover {
    background-color: #A3CBB1;
  }
  /* 버리기 버튼: #F88A87, 호버 시 #E27675 */
  .stone-actions button.delete {
    background-color: #F88A87;
  }
  .stone-actions button.delete:hover {
    background-color: #E27675;
  }
  @media (max-width: 600px) {
    li {
      flex-direction: column;
      align-items: stretch;
      text-align: left;
    }
    .stone-actions {
      width: 100%;
      margin-top: 0.5rem;
      justify-content: center;
    }
    .stone-actions button {
      flex: 1;
    }
  }
  /* 뒤로 버튼: 배경 #D7D4CD, 글자색 및 테두리 #DDDDDD 적용 */
  .back-btn {
    position: fixed;
    bottom: 20px;
    left: 20px;
    background: #D7D4CD;
    color: #000;
    padding: 0.5rem 1rem;
    border: 1px solid #DDDDDD;
    border-radius: 4px;
    z-index: 1000;
    margin: 0;
    cursor: pointer;
  }
  /* 돌 사이즈 토글에 사용할 스타일 */
  .detailed-size-toggle {
    cursor: pointer;
    text-decoration: none;
    position: relative;
    z-index: 9999;
    display: inline;
  }
  /* 각 정보 줄의 간격을 최소화 (줄바꿈 있지만 간격 좁게) */
  .details-line {
    margin: 2px 0;
    padding: 0;
    line-height: 1.2;
    font-size: 14px;
  }
  .storage-icon {
    width: 2rem;
    height: 2rem;
    vertical-align: middle;
    margin-right: 0.5rem;
    margin-left: 0.5rem;
  }
</style>
