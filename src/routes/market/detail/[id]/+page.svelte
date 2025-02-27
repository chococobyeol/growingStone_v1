<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { t } from 'svelte-i18n';
  import { supabase } from '$lib/supabaseClient';
  import { getListingDetail, cancelListing, buyNow, placeBid, finalizeAuction } from '$lib/marketUtils';
  import { getStoneImagePath, getDefaultImagePath } from '$lib/imageUtils';
  
  const listingId = $page.params.id;
  let listing: any = null;
  let loading = true;
  let errorMsg = '';
  let successMsg = '';
  let bidAmount = 0;
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
        
        // 최소 입찰가 설정
        if (listing.currentBidPrice) {
          bidAmount = listing.currentBidPrice + 1;
        } else if (listing.minBidPrice) {
          bidAmount = listing.minBidPrice;
        }
        
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
  
  // 입찰 처리
  async function handlePlaceBid() {
    errorMsg = '';
    successMsg = '';
    if (!bidAmount || bidAmount <= 0) {
      errorMsg = "유효한 입찰 금액을 입력하세요.";
      return;
    }
    
    try {
      const result = await placeBid(listingId, bidAmount);
      if (result.success) {
        successMsg = result.message;
        await loadListingDetail();
        await loadUserBalance();
      } else {
        errorMsg = result.message;
      }
    } catch (error) {
      errorMsg = (error as Error).message;
    }
  }
  
  // 판매 취소
  async function handleCancelListing() {
    if (!confirm('정말로 판매를 취소하시겠습니까?')) return;
    
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
  
  // 경매 종료 처리
  async function handleFinalizeAuction() {
    if (!confirm('경매를 종료하고 낙찰 처리하시겠습니까?')) return;
    
    errorMsg = '';
    successMsg = '';
    try {
      const result = await finalizeAuction(listingId);
      if (result.success) {
        successMsg = result.message;
        await loadListingDetail();
      } else {
        errorMsg = result.message;
      }
    } catch (error) {
      errorMsg = (error as Error).message;
    }
  }
  
  // 남은 시간 표시 형식
  function formatTimeRemaining(seconds: number): string {
    if (seconds <= 0) return "만료됨";
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    if (hours > 0) {
      return `${hours}시간 ${minutes}분`;
    } else if (minutes > 0) {
      return `${minutes}분 ${remainingSeconds}초`;
    } else {
      return `${remainingSeconds}초`;
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
    <button class="back-button" on:click={() => goto('/market')}>← 목록으로 돌아가기</button>
  </div>
  
  {#if errorMsg}
    <div class="error-message">{errorMsg}</div>
  {/if}
  
  {#if successMsg}
    <div class="success-message">{successMsg}</div>
  {/if}
  
  {#if loading}
    <div class="loading">판매 정보를 불러오는 중...</div>
  {:else if !listing}
    <div class="not-found">판매 목록을 찾을 수 없습니다.</div>
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
          <p class="stone-type">종류: {listing.stoneType}</p>
          <p class="stone-size">크기: {listing.stoneSize.toFixed(2)}</p>
        </div>
        
        <div class="listing-status">
          {#if listing.status === 'sold'}
            <p class="sold-notice">판매 완료</p>
          {:else if listing.status === 'expired'}
            <p class="expired-notice">판매 종료</p>
          {:else}
            <p class="time-remaining {listing.timeRemaining < 300 ? 'urgent' : ''}">
              남은 시간: {formatTimeRemaining(listing.timeRemaining)}
            </p>
          {/if}
        </div>
        
        <div class="price-section">
          {#if listing.buyNowPrice}
            <div class="buy-now-section">
              <p class="buy-now-price">즉시 구매가: {listing.buyNowPrice} 스톤</p>
              {#if !isOwner && listing.status === 'active'}
                <button 
                  class="buy-now-button" 
                  disabled={userBalance < listing.buyNowPrice}
                  on:click={handleBuyNow}
                >
                  지금 구매하기
                  {#if userBalance < listing.buyNowPrice}
                    (잔액 부족)
                  {/if}
                </button>
              {/if}
            </div>
          {/if}
          
          {#if listing.minBidPrice}
            <div class="auction-section">
              {#if listing.currentBidPrice}
                <p class="current-bid">
                  현재 입찰가: {listing.currentBidPrice} 스톤
                  {#if listing.isMyBid}<span class="my-bid">(내 입찰)</span>{/if}
                </p>
              {:else}
                <p class="min-bid">최소 입찰가: {listing.minBidPrice} 스톤</p>
              {/if}
              
              {#if !isOwner && listing.status === 'active'}
                <div class="bid-input-group">
                  <input 
                    type="number" 
                    bind:value={bidAmount} 
                    min={listing.currentBidPrice ? listing.currentBidPrice + 1 : listing.minBidPrice} 
                    step="1"
                  />
                  <button 
                    class="place-bid-button" 
                    disabled={userBalance < bidAmount || bidAmount <= (listing.currentBidPrice || 0)}
                    on:click={handlePlaceBid}
                  >
                    입찰하기
                  </button>
                </div>
                {#if userBalance < bidAmount}
                  <p class="balance-warning">잔액이 부족합니다.</p>
                {/if}
              {/if}
            </div>
          {/if}
          
          <p class="user-balance">내 잔액: {userBalance} 스톤</p>
        </div>
        
        {#if isOwner && listing.status === 'active'}
          <div class="owner-actions">
            <button class="cancel-button" on:click={handleCancelListing}>판매 취소</button>
            
            {#if listing.minBidPrice && listing.currentBidPrice && listing.timeRemaining <= 0}
              <button class="finalize-button" on:click={handleFinalizeAuction}>낙찰 처리</button>
            {/if}
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
  
  .buy-now-section, .auction-section {
    margin-bottom: 1rem;
  }
  
  .buy-now-price, .current-bid, .min-bid {
    font-size: 1.3rem;
    font-weight: bold;
    margin-bottom: 0.5rem;
  }
  
  .buy-now-button, .place-bid-button {
    background-color: #B7DDBF;
    color: #000;
    border: 1px solid #DDDDDD;
    padding: 0.75rem 1.5rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1rem;
    transition: background-color 0.2s;
  }
  
  .buy-now-button:hover:not(:disabled), .place-bid-button:hover:not(:disabled) {
    background-color: #A3CBB1;
  }
  
  .buy-now-button:disabled, .place-bid-button:disabled {
    background-color: #cccccc;
    cursor: not-allowed;
    opacity: 0.7;
  }
  
  .bid-input-group {
    display: flex;
    gap: 0.5rem;
    margin: 0.5rem 0;
  }
  
  .bid-input-group input {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
  }
  
  .balance-warning {
    color: #e74c3c;
    font-size: 0.9rem;
    margin-top: 0.3rem;
  }
  
  .user-balance {
    margin-top: 1rem;
    font-weight: bold;
  }
  
  .my-bid {
    color: #3498db;
    font-size: 0.9rem;
    margin-left: 0.5rem;
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
  
  .finalize-button {
    background-color: #3498db;
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 4px;
    cursor: pointer;
  }
  
  .finalize-button:hover {
    background-color: #2980b9;
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
