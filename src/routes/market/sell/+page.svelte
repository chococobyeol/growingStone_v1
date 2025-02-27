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
      
      if (!buyNowPrice || buyNowPrice <= 0) {
        errorMsg = "구매 가격을 설정해야 합니다.";
        return;
      }
      
      const result = await createListing(
        selectedStoneId,
        buyNowPrice || undefined,
        duration
      );
      
      if (result.success) {
        successMsg = result.message;
        // 성공 후 필드 초기화
        selectedStoneId = '';
        buyNowPrice = undefined;
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
      errorMsg = (error as Error).message;
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
  
  <h1>{$t('sellStone')}</h1>
  
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
          <label for="stone-select">{$t('selectStone')}</label>
          <select id="stone-select" bind:value={selectedStoneId}>
            <option value="">{$t('chooseStonePlaceholder')}</option>
            {#each stones as stone}
              <option value={stone.id}>{stone.name} ({$t(`stoneTypes.${stone.type}`)})</option>
            {/each}
          </select>
        </div>
        
        <div class="form-group">
          <label for="buy-now-price">{$t('buyNowPrice')}</label>
          <input 
            id="buy-now-price" 
            type="number" 
            bind:value={buyNowPrice} 
            min="1" 
            step="1"
            placeholder={$t('enterPricePlaceholder')}
          />
        </div>
        
        <div class="form-group">
          <label for="duration">{$t('listingDuration')}</label>
          <select id="duration" bind:value={duration}>
            <option value="60">1 {$t('hour')}</option>
            <option value="360">6 {$t('hours')}</option>
            <option value="720">12 {$t('hours')}</option>
            <option value="1440">1 {$t('day')}</option>
            <option value="4320">3 {$t('days')}</option>
            <option value="10080">7 {$t('days')}</option>
          </select>
        </div>
        
        <button
          type="submit"
          class="submit-button"
          disabled={!selectedStoneId || !buyNowPrice || buyNowPrice <= 0}
        >
          {loading ? $t('processing') : $t('listForSale')}
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
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
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
