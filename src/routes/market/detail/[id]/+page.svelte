<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { t, locale } from 'svelte-i18n';
  import { supabase } from '$lib/supabaseClient';
  import { getListingDetail, cancelListing, buyNow } from '$lib/marketUtils';
  import { getStoneImagePath, getDefaultImagePath } from '$lib/imageUtils';
  
  const listingId = $page.params.id;
  let listing: any = null;
  let loading = true;
  let errorMsg = '';
  let successMsg = '';
  let userBalance = 0;
  let isOwner = false;
  let refreshTimer: ReturnType<typeof setInterval>;
  let marketSubscription: any;
  
  // 잔액 로드
  async function loadUserBalance() {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session?.user) {
      const { data } = await supabase
        .from('profiles')
        .select('balance')
        .eq('id', sessionData.session.user.id)
        .single();
      
      if (data) {
        userBalance = data.balance || 0;
      }
    }
  }
  
  // 판매 목록 상세 정보 로딩
  async function loadListingDetail() {
    loading = true;
    errorMsg = '';
    try {
      const result = await getListingDetail(listingId);
      if (result) {
        listing = result;
        
        // 소유자 확인
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session?.user) {
          isOwner = sessionData.session.user.id === listing.seller.id;
        }
      } else {
        errorMsg = "판매 목록을 찾을 수 없습니다.";
      }
    } catch (error) {
      errorMsg = (error as Error).message;
    } finally {
      loading = false;
    }
  }
  
  // 즉시 구매 처리
  async function handleBuyNow() {
    errorMsg = '';
    successMsg = '';
    try {
      const result = await buyNow(listingId);
      if (result.success) {
        successMsg = result.message;
        setTimeout(() => {
          goto('/storage');
        }, 1500);
      } else {
        errorMsg = result.message;
      }
    } catch (error) {
      errorMsg = (error as Error).message;
    }
  }
  
  // 판매 취소
  async function handleCancelListing() {
    if (!confirm($t('confirmCancelListing'))) return;
    
    errorMsg = '';
    successMsg = '';
    try {
      const result = await cancelListing(listingId);
      if (result.success) {
        successMsg = result.message;
        setTimeout(() => goto('/market'), 2000);
      } else {
        errorMsg = result.message;
      }
    } catch (error) {
      errorMsg = (error as Error).message;
    }
  }
  
  // 남은 시간 표시 형식
  function formatTimeRemaining(seconds: number): string {
    if (seconds <= 0) return $t('expired');
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    if (hours > 0) {
      return $locale === 'ko' 
        ? `${hours}${$t('hours')} ${minutes}${$t('minutes')}` 
        : `${hours} ${$t('hours')} ${minutes} ${$t('minutes')}`;
    } else if (minutes > 0) {
      return $locale === 'ko'
        ? `${minutes}${$t('minutes')} ${remainingSeconds}${$t('seconds')}`
        : `${minutes} ${$t('minutes')} ${remainingSeconds} ${$t('seconds')}`;
    } else {
      return $locale === 'ko'
        ? `${remainingSeconds}${$t('seconds')}`
        : `${remainingSeconds} ${$t('seconds')}`;
    }
  }
  
  // 이미지 로드 에러 처리 함수
  function handleImageError(e: Event) {
    const imgElement = e.target as HTMLImageElement;
    imgElement.src = '/assets/img/no-image.png';
    imgElement.onerror = null; // 무한 루프 방지
  }
  
  onMount(() => {
    // 즉시 실행 비동기 함수
    (async () => {
      await loadListingDetail();
      await loadUserBalance();
      
      // 실시간 업데이트
      marketSubscription = supabase
        .channel('listing-detail')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'market_listings',
            filter: `id=eq.${listingId}`
          },
          (payload) => {
            loadListingDetail();
          }
        )
        .subscribe();
      
      // 남은 시간 업데이트 타이머
      refreshTimer = setInterval(() => {
        if (listing && listing.timeRemaining > 0) {
          listing = {
            ...listing,
            timeRemaining: Math.max(0, listing.timeRemaining - 1)
          };
        }
      }, 1000);
    })();
    
    // 정리 함수 반환
    return () => {
      if (marketSubscription) {
        supabase.removeChannel(marketSubscription);
      }
      clearInterval(refreshTimer);
    };
  });
  
  onDestroy(() => {
    if (refreshTimer) {
      clearInterval(refreshTimer);
    }
  });
</script>

<div class="detail-container">
  <div class="back-button-container">
    <button class="back-button" on:click={() => goto('/market')}>← {$t('backToList')}</button>
  </div>
  
  {#if errorMsg}
    <div class="error-message">{errorMsg}</div>
  {/if}
  
  {#if successMsg}
    <div class="success-message">{successMsg}</div>
  {/if}
  
  {#if loading}
    <div class="loading">{$t('loadingListingInfo')}</div>
  {:else if !listing}
    <div class="not-found">{$t('listingNotFound')}</div>
  {:else}
    <div class="listing-detail">
      <div class="stone-image-section">
        <div class="stone-image-container">
          <img 
            src={getStoneImagePath(listing.stoneType)} 
            alt={listing.stoneName} 
            class="stone-image"
            on:error={handleImageError}
          />
        </div>
      </div>
      
      <div class="listing-info-section">
        <h1 class="stone-name">{listing.stoneName}</h1>
        
        <div class="stone-details">
          <p class="stone-type">{$t('stoneType')}: {$t(`stoneTypes.${listing.stoneType}`)}</p>
          <p class="stone-size">{$t('stoneSize')}: {listing.stoneSize.toFixed(2)}</p>
        </div>
        
        <div class="listing-status">
          {#if listing.status === 'sold'}
            <p class="sold-notice">{$t('saleComplete')}</p>
          {:else if listing.status === 'expired'}
            <p class="expired-notice">{$t('saleEnded')}</p>
          {:else}
            <p class="time-remaining {listing.timeRemaining < 300 ? 'urgent' : ''}">
               {$t('remainingTime')}: {formatTimeRemaining(listing.timeRemaining)}
            </p>
          {/if}
        </div>
        
        <div class="price-section">
          {#if listing.buyNowPrice}
            <div class="buy-now-section">
              <p class="buy-now-price">{$t('buyNowPrice')}: {listing.buyNowPrice} {$t('stone')}</p>
              {#if !isOwner && listing.status === 'active'}
                <button 
                  class="buy-now-button"
                  on:click={handleBuyNow}
                >
                  {$t('buyNow')}
                  {#if userBalance < listing.buyNowPrice}
                    ({$t('insufficientBalance')})
                  {/if}
                </button>
              {/if}
            </div>
          {/if}
          
          <p class="user-balance">{$t('myBalance')}: {userBalance} {$t('stone')}</p>
        </div>
        
        {#if isOwner && listing.status === 'active'}
          <div class="owner-actions">
            <button class="cancel-button" on:click={handleCancelListing}>{$t('cancelListing')}</button>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .detail-container {
    max-width: 900px;
    margin: 0 auto;
    padding: 1rem;
  }
  
  .back-button-container {
    margin-bottom: 1.5rem;
  }
  
  .back-button {
    background-color: #D7D4CD;
    border: 1px solid #DDDDDD;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    color: #000;
  }
  
  .back-button:hover {
    background-color: #cac7c0;
  }
  
  .loading, .not-found {
    text-align: center;
    padding: 2rem;
    color: #777;
  }
  
  .error-message {
    color: #e74c3c;
    margin-bottom: 1rem;
    padding: 0.5rem;
    background-color: #fce4e4;
    border-radius: 4px;
  }
  
  .success-message {
    color: #27ae60;
    margin-bottom: 1rem;
    padding: 0.5rem;
    background-color: #e6faf0;
    border-radius: 4px;
  }
  
  .listing-detail {
    display: flex;
    gap: 2rem;
    background-color: white;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    padding: 1.5rem;
  }
  
  .stone-image-section {
    flex: 0 0 40%;
  }
  
  .stone-image-container {
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #f9f9f9;
    padding: 2rem;
    border-radius: 8px;
    height: 300px;
  }
  
  .stone-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  
  .listing-info-section {
    flex: 1;
  }
  
  .stone-name {
    font-size: 1.8rem;
    margin: 0 0 1rem 0;
  }
  
  .stone-details {
    margin-bottom: 1.5rem;
    font-size: 1.1rem;
  }
  
  .stone-details p {
    margin: 0.5rem 0;
  }
  
  .listing-status {
    margin-bottom: 1.5rem;
  }
  
  .time-remaining {
    font-size: 1.2rem;
    font-weight: bold;
    color: #e67e22;
  }
  
  .time-remaining.urgent {
    color: #e74c3c;
    animation: pulse 1s infinite;
  }
  
  .sold-notice, .expired-notice {
    font-size: 1.2rem;
    font-weight: bold;
    color: #7f8c8d;
  }
  
  .price-section {
    margin-bottom: 1.5rem;
    padding: 1rem;
    background-color: #f5f5f5;
    border-radius: 8px;
  }
  
  .buy-now-section {
    margin-bottom: 1rem;
  }
  
  .buy-now-button {
    background-color: #B7DDBF;
    color: #000;
    border: 1px solid #DDDDDD;
    padding: 0.75rem 1.5rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1rem;
    transition: background-color 0.2s;
  }
  
  .buy-now-button:hover:not(:disabled) {
    background-color: #A3CBB1;
  }
  
  .buy-now-button:disabled {
    background-color: #cccccc;
    cursor: not-allowed;
    opacity: 0.7;
  }
  
  .owner-actions {
    display: flex;
    gap: 1rem;
    margin-top: 1rem;
  }
  
  .cancel-button {
    background-color: #e74c3c;
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 4px;
    cursor: pointer;
  }
  
  .cancel-button:hover {
    background-color: #c0392b;
  }
  
  @keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.7; }
    100% { opacity: 1; }
  }
  
  @media (max-width: 768px) {
    .listing-detail {
      flex-direction: column;
    }
    
    .stone-image-section {
      flex: none;
    }
    
    .stone-image-container {
      height: 200px;
    }
  }
</style>
