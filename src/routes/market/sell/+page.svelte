<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { t } from 'svelte-i18n';
  import { createListing } from '$lib/marketUtils';
  import { supabase } from '$lib/supabaseClient';
  import { get } from 'svelte/store';
  import { currentStone } from '$lib/stoneStore';
  
  interface Stone {
    id: string;
    type: string;
    name: string;
    size: number;
    market_listings?: Array<{ id: string; status: string }>;
  }
  
  let stones: Stone[] = [];
  let loading = true;
  let errorMsg = '';
  let successMsg = '';
  
  // 판매 폼 상태
  let selectedStoneId = '';
  let buyNowPrice: number | undefined = undefined;
  let minBidPrice: number | undefined = undefined;
  let duration = 60; // 기본 60분
  
  // 내 돌 목록 로딩
  async function loadMyStones() {
    loading = true;
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        errorMsg = '로그인이 필요합니다.';
        return;
      }
      
      const { data, error } = await supabase
        .from('stones')
        .select('*, market_listings!left(id, status)')
        .eq('user_id', userData.user.id);
        
      if (error) throw error;
      
      const current = get(currentStone);
      stones = data.filter(stone => {
        if (stone.id === current.id) return false;
        return !(stone.market_listings && 
                 stone.market_listings.some((listing: {status: string}) => listing.status === 'active'));
      });
      
    } catch (error) {
      console.error('내 돌 조회 오류:', error);
      errorMsg = '돌 목록을 가져오는 중 오류가 발생했습니다.';
    } finally {
      loading = false;
    }
  }
  
  // 판매 등록 처리
  async function handleSubmit() {
    try {
      errorMsg = '';
      successMsg = '';
      
      if (!selectedStoneId) {
        errorMsg = "판매할 돌을 선택해주세요.";
        return;
      }
      
      const current = get(currentStone);
      if (selectedStoneId === current.id) {
        errorMsg = '현재 키우고 있는 돌은 마켓에 등록할 수 없습니다.';
        return;
      }
      
      if ((!buyNowPrice || buyNowPrice <= 0) && (!minBidPrice || minBidPrice <= 0)) {
        errorMsg = "즉시 구매 가격 또는 최소 입찰 가격을 설정해야 합니다.";
        return;
      }
      
      if (buyNowPrice && minBidPrice && minBidPrice >= buyNowPrice) {
        errorMsg = "최소 입찰 가격은 즉시 구매 가격보다 낮아야 합니다.";
        return;
      }
      
      const result = await createListing(
        selectedStoneId,
        buyNowPrice || undefined,
        minBidPrice || undefined,
        duration
      );
      
      if (result.success) {
        successMsg = result.message;
        // 성공 후 필드 초기화
        selectedStoneId = '';
        buyNowPrice = undefined;
        minBidPrice = undefined;
        duration = 60;
        // 돌 목록 다시 로드
        await loadMyStones();
        
        // 3초 후 목록 페이지로 이동
        setTimeout(() => {
          goto('/market');
        }, 3000);
      } else {
        errorMsg = result.message;
      }
    } catch (error) {
      errorMsg = "판매 등록 중 오류가 발생했습니다: " + (error as Error).message;
    }
  }
  
  onMount(loadMyStones);
</script>

<div class="sell-container">
  <div class="back-button-container">
    <button class="back-button" on:click={() => goto('/market')}>
      ← 목록으로 돌아가기
    </button>
  </div>
  
  <h1>돌 판매 등록</h1>
  
  {#if errorMsg}
    <div class="error-message">{errorMsg}</div>
  {/if}
  
  {#if successMsg}
    <div class="success-message">{successMsg}</div>
  {/if}
  
  {#if loading}
    <div class="loading">판매 가능한 돌을 불러오는 중...</div>
  {:else}
    {#if stones.length === 0}
      <div class="empty-state">판매 가능한 돌이 없습니다.</div>
    {:else}
      <form class="sell-form" on:submit|preventDefault={handleSubmit}>
        <div class="form-group">
          <label for="stone-select">판매할 돌 선택</label>
          <select id="stone-select" bind:value={selectedStoneId} required>
            <option value="">-- 선택하세요 --</option>
            {#each stones as stone}
              <option value={stone.id}>
                {stone.name} ({stone.type}, 크기: {stone.size.toFixed(2)})
              </option>
            {/each}
          </select>
        </div>
        
        <div class="form-group">
          <label for="buy-now-price">즉시 구매 가격 (스톤)</label>
          <input
            id="buy-now-price"
            type="number"
            bind:value={buyNowPrice}
            min="1"
            placeholder="즉시 구매 불가능"
          />
          <small>비워두면 경매만 가능합니다.</small>
        </div>
        
        <div class="form-group">
          <label for="min-bid-price">최소 입찰 가격 (스톤)</label>
          <input
            id="min-bid-price"
            type="number"
            bind:value={minBidPrice}
            min="1"
            placeholder="경매 불가능"
          />
          <small>비워두면 즉시 구매만 가능합니다.</small>
        </div>
        
        <div class="form-group">
          <label for="duration">판매 기간 (분)</label>
          <select id="duration" bind:value={duration}>
            <option value="5">5분 (테스트용)</option>
            <option value="60">1시간</option>
            <option value="360">6시간</option>
            <option value="720">12시간</option>
            <option value="1440">24시간</option>
          </select>
        </div>
        
        <button
          type="submit"
          class="submit-button"
          disabled={!selectedStoneId || ((!buyNowPrice || buyNowPrice <= 0) && (!minBidPrice || minBidPrice <= 0))}
        >
          판매 등록하기
        </button>
      </form>
    {/if}
  {/if}
</div>

<style>
  .sell-container {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem 1rem;
  }
  
  h1 {
    margin-bottom: 1.5rem;
    text-align: center;
  }
  
  .back-button-container {
    margin-bottom: 1rem;
  }
  
  .back-button {
    background: none;
    border: none;
    color: #555;
    cursor: pointer;
    padding: 0.5rem 0;
    font-size: 0.9rem;
  }
  
  .back-button:hover {
    color: #000;
    text-decoration: underline;
  }
  
  .error-message {
    color: #d9534f;
    margin-bottom: 1rem;
    padding: 0.5rem;
    background-color: #f9e2e2;
    border-radius: 4px;
  }
  
  .success-message {
    color: #27ae60;
    margin-bottom: 1rem;
    padding: 0.5rem;
    background-color: #e6faf0;
    border-radius: 4px;
  }
  
  .sell-form {
    background-color: white;
    border-radius: 8px;
    padding: 1.5rem;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }
  
  .form-group {
    margin-bottom: 1.5rem;
  }
  
  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: bold;
  }
  
  .form-group input, .form-group select {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 1rem;
  }
  
  .form-group small {
    display: block;
    margin-top: 0.25rem;
    color: #888;
  }
  
  .submit-button {
    width: 100%;
    padding: 0.75rem;
    background-color: #B7DDBF;
    border: 1px solid #DDDDDD;
    border-radius: 4px;
    font-size: 1rem;
    cursor: pointer;
    color: #000;
  }
  
  .submit-button:hover:not(:disabled) {
    background-color: #A3CBB1;
  }
  
  .submit-button:disabled {
    background-color: #cccccc;
    cursor: not-allowed;
    opacity: 0.7;
  }
  
  .loading, .empty-state {
    text-align: center;
    padding: 2rem;
    color: #777;
  }
</style>
