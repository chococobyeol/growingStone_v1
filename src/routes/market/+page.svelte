<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { t } from 'svelte-i18n';
  import { supabase } from '$lib/supabaseClient';
  import { getActiveListings, getMyListings, checkExpiredListings, buyNow, placeBid, cancelListing } from '$lib/marketUtils';
  import { getStoneImagePath, getDefaultImagePath } from '$lib/imageUtils';
  import type { ListingItem } from '$lib/marketUtils';
  import type { RealtimeChannel } from '@supabase/supabase-js';
  
  let listings: ListingItem[] = [];
  let myListings: ListingItem[] = [];
  let loading = true;
  let errorMsg = '';
  let selectedType = 'all';
  let selectedSortBy = 'created';
  let selectedListingType = 'all';
  let refreshInterval: ReturnType<typeof setInterval>;
  let marketSubscription: RealtimeChannel;
  let currentUserId: string | null = null;
  let bidAmounts: {[key: string]: number} = {};
  let processingListingId: string | null = null;
  
  // 새로 추가: 마켓 탭 상태 (buy=구매, sell=판매)
  let marketTab = 'buy';
  
  // 초기 로딩 함수 - 구매 탭
  async function loadMarketListings() {
    loading = true;
    errorMsg = '';
    try {
      // 먼저 만료된 목록 처리
      await checkExpiredListings();
      
      // 그 다음 목록 로딩
      listings = await getActiveListings({
        stoneType: selectedType !== 'all' ? selectedType : undefined,
        sortBy: selectedSortBy as any,
        listingType: selectedListingType as any
      });
      
      // 사용자 정보 로드
      await loadUserInfo();
    } catch (error) {
      errorMsg = (error as Error).message;
    } finally {
      loading = false;
    }
  }
  
  // 내 판매 목록 로딩 함수
  async function loadMySellingItems() {
    loading = true;
    errorMsg = '';
    try {
      myListings = await getMyListings();
    } catch (error) {
      errorMsg = (error as Error).message;
    } finally {
      loading = false;
    }
  }
  
  // 현재 사용자 정보 로드
  async function loadUserInfo() {
    const { data } = await supabase.auth.getSession();
    currentUserId = data?.session?.user?.id || null;
    
    // 각 항목에 대한 초기 입찰가 설정
    if (listings.length > 0) {
      listings.forEach(listing => {
        if (listing.minBidPrice) {
          bidAmounts[listing.id] = listing.currentBidPrice 
            ? listing.currentBidPrice + 1 
            : listing.minBidPrice;
        }
      });
    }
  }
  
  // 탭 전환 함수
  function switchTab(tab: 'buy' | 'sell') {
    marketTab = tab;
    
    if (tab === 'buy') {
      loadMarketListings();
    } else {
      loadMySellingItems();
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
  
  // 이미지 오류 처리
  function handleImageError(e: Event) {
    const imgElement = e.target as HTMLImageElement;
    imgElement.src = '/assets/img/no-image.png';
    imgElement.onerror = null; // 무한 루프 방지
  }
  
  // 즉시 구매 처리
  async function handleBuyNow(listingId: string) {
    if (processingListingId) return;
    
    processingListingId = listingId;
    try {
      const result = await buyNow(listingId);
      if (result.success) {
        alert(result.message);
        await loadMarketListings();
      } else {
        alert(result.message);
      }
    } catch (error) {
      alert('구매 처리 중 오류가 발생했습니다.');
    } finally {
      processingListingId = null;
    }
  }
  
  // 입찰 처리
  async function handlePlaceBid(listingId: string) {
    if (!bidAmounts[listingId] || processingListingId) return;
    
    processingListingId = listingId;
    try {
      const bidAmount = bidAmounts[listingId];
      const result = await placeBid(listingId, bidAmount);
      if (result.success) {
        alert(result.message);
        await loadMarketListings();
      } else {
        alert(result.message);
      }
    } catch (error) {
      alert('입찰 처리 중 오류가 발생했습니다.');
    } finally {
      processingListingId = null;
    }
  }
  
  // 판매 취소 처리
  async function handleCancelListing(listingId: string) {
    if (!confirm('정말 판매를 취소하시겠습니까?') || processingListingId) return;
    
    processingListingId = listingId;
    try {
      const result = await cancelListing(listingId);
      if (result.success) {
        alert(result.message);
        if (marketTab === 'buy') {
          await loadMarketListings();
        } else {
          await loadMySellingItems();
        }
      } else {
        alert(result.message);
      }
    } catch (error) {
      alert('판매 취소 중 오류가 발생했습니다.');
    } finally {
      processingListingId = null;
    }
  }
  
  // 실시간 구독 설정
  onMount(() => {
    // 초기 데이터 로딩
    loadMarketListings();
    
    if (marketTab === 'sell') {
      loadMySellingItems();
    }
    
    // 타이머 설정 - 시간 표시 업데이트용
    const timeUpdateInterval = setInterval(() => {
      // 목록의 남은 시간 업데이트
      listings = listings.map(listing => {
        const expiresAt = new Date(listing.expiresAt);
        const now = new Date();
        const timeRemaining = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
        return { ...listing, timeRemaining };
      });
      
      // 내 판매 목록의 남은 시간 업데이트
      myListings = myListings.map(listing => {
        const expiresAt = new Date(listing.expiresAt);
        const now = new Date();
        const timeRemaining = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
        return { ...listing, timeRemaining };
      });
    }, 1000);
    
    // 실시간 구독 설정 - 단순화된 콜백
    marketSubscription = supabase
      .channel('market-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'market_listings' }, 
        (payload) => {
          console.log('마켓 데이터 변경 감지:', payload);
          // 비동기 작업 없이 변경 감지만 하고 데이터 갱신은 별도로 처리
          setTimeout(() => refreshListingsData(), 100);
        })
      .subscribe();
    
    // 데이터 갱신을 위한 주기적 타이머 (30초마다)
    refreshInterval = setInterval(() => {
      refreshListingsData();
    }, 30000);
    
    // onDestroy에 timeUpdateInterval 추가
    return () => {
      clearInterval(timeUpdateInterval);
      clearInterval(refreshInterval);
      if (marketSubscription) supabase.removeChannel(marketSubscription);
    };
  });

  // 데이터 갱신 함수 (별도로 분리)
  async function refreshListingsData() {
    try {
      // 만료된 목록 체크
      await checkExpiredListings();
      
      // 현재 탭에 따라 데이터 갱신
      if (marketTab === 'buy') {
        const newListings = await getActiveListings({
          stoneType: selectedType !== 'all' ? selectedType : undefined,
          sortBy: selectedSortBy as any,
          listingType: selectedListingType as any
        });
        listings = newListings;
      } else if (marketTab === 'sell') {
        const newMyListings = await getMyListings();
        myListings = newMyListings;
      }
    } catch (error) {
      console.error('데이터 갱신 중 오류:', error);
    }
  }
</script>

<div class="market-container">
  <h1>돌 마켓</h1>
  
  <div class="market-actions">
    <button class="sell-button" on:click={() => goto('/market/sell')}>판매 등록</button>
  </div>
  
  <!-- 탭 메뉴 추가 -->
  <div class="market-tabs">
    <button 
      class={marketTab === 'buy' ? 'active' : ''} 
      on:click={() => switchTab('buy')}
    >
      구매하기
    </button>
    <button 
      class={marketTab === 'sell' ? 'active' : ''} 
      on:click={() => switchTab('sell')}
    >
      내 판매 목록
    </button>
  </div>
  
  {#if marketTab === 'buy'}
    <!-- 구매 탭 내용 -->
    <div class="filter-controls">
      <!-- 기존 필터 컨트롤 -->
      <div class="filter-group">
        <label for="stoneType">돌 종류:</label>
        <select id="stoneType" bind:value={selectedType} on:change={loadMarketListings}>
          <option value="all">전체</option>
          <option value="화강암">화강암</option>
          <option value="대리석">대리석</option>
          <option value="현무암">현무암</option>
          <option value="사암">사암</option>
          <option value="편암">편암</option>
        </select>
      </div>
      
      <div class="filter-group">
        <label for="listingType">판매 유형:</label>
        <select id="listingType" bind:value={selectedListingType} on:change={loadMarketListings}>
          <option value="all">전체</option>
          <option value="buyNow">즉시 구매</option>
          <option value="auction">경매</option>
        </select>
      </div>
      
      <div class="filter-group">
        <label for="sortBy">정렬:</label>
        <select id="sortBy" bind:value={selectedSortBy} on:change={loadMarketListings}>
          <option value="created">최신순</option>
          <option value="expiry">마감임박순</option>
          <option value="size">크기순</option>
          <option value="name">이름순</option>
        </select>
      </div>
    </div>
    
    {#if loading}
      <div class="loading">로딩 중...</div>
    {:else if errorMsg}
      <div class="error-message">{errorMsg}</div>
    {:else if listings.length === 0}
      <div class="empty-state">판매 중인 돌이 없습니다.</div>
    {:else}
      <div class="listing-grid">
        {#each listings as listing}
          <div class="stone-tile">
            <div class="stone-image">
              <img 
                src={getStoneImagePath(listing.stoneType)} 
                alt={listing.stoneName} 
                class="stone-image"
                on:error={handleImageError} 
              />
            </div>
            <div class="stone-info">
              <h3>{listing.stoneName}</h3>
              <p class="stone-info">
                <span class="stone-type">{listing.stoneType}</span>
                <span class="stone-size">크기: {listing.stoneSize.toFixed(2)}</span>
              </p>
              <div class="price-info">
                {#if listing.buyNowPrice}
                  <p class="buy-now-price">즉시 구매: {listing.buyNowPrice} 스톤</p>
                {/if}
                {#if listing.currentBidPrice}
                  <p class="current-bid-price">
                    현재 입찰가: {listing.currentBidPrice} 스톤
                    {#if listing.isMyBid}<span class="my-bid">(내 입찰)</span>{/if}
                  </p>
                {:else if listing.minBidPrice}
                  <p class="min-bid-price">시작 입찰가: {listing.minBidPrice} 스톤</p>
                {/if}
              </div>
              <p class="time-remaining">남은 시간: {formatTimeRemaining(listing.timeRemaining)}</p>
            </div>
            
            <div class="card-actions">
              {#if currentUserId && currentUserId !== listing.seller.id}
                {#if listing.buyNowPrice && !listing.isMyListing && listing.seller.id !== currentUserId}
                  <button 
                    class="buy-button"
                    on:click={() => handleBuyNow(listing.id)}
                    disabled={processingListingId === listing.id}
                  >
                    즉시 구매
                  </button>
                {/if}
                
                {#if listing.minBidPrice && listing.timeRemaining > 0}
                  <div class="bid-controls">
                    <input 
                      type="number" 
                      bind:value={bidAmounts[listing.id]} 
                      min={listing.currentBidPrice ? listing.currentBidPrice + 1 : listing.minBidPrice}
                    />
                    <button 
                      class="bid-button" 
                      on:click={() => handlePlaceBid(listing.id)}
                      disabled={processingListingId === listing.id}
                    >
                      {processingListingId === listing.id ? '처리 중...' : '입찰'}
                    </button>
                  </div>
                {/if}
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {:else}
    <!-- 판매 탭 내용 -->
    {#if loading}
      <div class="loading">로딩 중...</div>
    {:else if errorMsg}
      <div class="error-message">{errorMsg}</div>
    {:else if myListings.length === 0}
      <div class="empty-state">판매 중인 돌이 없습니다.
        <button class="action-button" on:click={() => goto('/market/sell')}>돌 판매하기</button>
      </div>
    {:else}
      <div class="listing-grid">
        {#each myListings as listing}
          <div class="stone-tile">
            <div class="stone-image">
              <img 
                src={getStoneImagePath(listing.stoneType)} 
                alt={listing.stoneName} 
                class="stone-image"
                on:error={handleImageError} 
              />
            </div>
            <div class="stone-info">
              <h3>{listing.stoneName}</h3>
              <p class="stone-info">
                <span class="stone-type">{listing.stoneType}</span>
                <span class="stone-size">크기: {listing.stoneSize.toFixed(2)}</span>
              </p>
              <div class="price-info">
                {#if listing.buyNowPrice}
                  <p class="buy-now-price">즉시 구매: {listing.buyNowPrice} 스톤</p>
                {/if}
                {#if listing.currentBidPrice}
                  <p class="current-bid-price">
                    현재 입찰가: {listing.currentBidPrice} 스톤
                  </p>
                {:else if listing.minBidPrice}
                  <p class="min-bid-price">시작 입찰가: {listing.minBidPrice} 스톤</p>
                {/if}
              </div>
              <p class="time-remaining">남은 시간: {formatTimeRemaining(listing.timeRemaining)}</p>
            </div>
            
            <div class="card-actions">
              <button 
                class="cancel-button" 
                on:click={() => handleCancelListing(listing.id)}
                disabled={processingListingId === listing.id}
              >
                {processingListingId === listing.id ? '처리 중...' : '판매 취소'}
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  <!-- 뒤로 가기 버튼 -->
  <button class="back-btn" on:click={() => goto('/')}>{$t('backButton')}</button>
</div>

<style>
  .market-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1rem;
  }
  
  .market-actions {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 1rem;
  }
  
  .sell-button {
    background-color: #27ae60;
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 4px;
    cursor: pointer;
  }
  
  .sell-button:hover {
    background-color: #219653;
  }
  
  /* 탭 스타일 추가 */
  .market-tabs {
    display: flex;
    border-bottom: 1px solid #ddd;
    margin-bottom: 1rem;
  }
  
  .market-tabs button {
    padding: 0.75rem 1.5rem;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    border-bottom: 3px solid transparent;
  }
  
  .market-tabs button.active {
    border-bottom: 3px solid #3498db;
    font-weight: bold;
  }
  
  .filter-controls {
    display: flex;
    gap: 1rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }
  
  .filter-group {
    display: flex;
    flex-direction: column;
    min-width: 150px;
  }
  
  .filter-group label {
    margin-bottom: 0.3rem;
    font-size: 0.9rem;
    color: #666;
  }
  
  .filter-group select {
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
  }
  
  .listing-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1.5rem;
  }
  
  .stone-tile {
    border: 1px solid #ddd;
    border-radius: 8px;
    overflow: hidden;
    background-color: white;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    display: flex;
    flex-direction: column;
  }
  
  .stone-image {
    height: 180px;
    overflow: hidden;
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: #f5f5f5;
  }
  
  .stone-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  
  .stone-info {
    padding: 1rem;
    flex: 1;
  }
  
  .stone-info h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.2rem;
  }
  
  .stone-info .stone-info {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
    color: #666;
  }
  
  .price-info {
    margin-bottom: 0.5rem;
  }
  
  .buy-now-price, .current-bid-price, .min-bid-price {
    margin: 0.2rem 0;
    font-weight: bold;
  }
  
  .my-bid {
    color: #3498db;
    font-size: 0.8rem;
  }
  
  .time-remaining {
    margin-top: 0.5rem;
    color: #e67e22;
    font-size: 0.9rem;
    font-weight: bold;
  }
  
  .card-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 1rem;
    width: 100%;
    padding: 0 1rem 1rem 1rem;
  }
  
  .bid-controls {
    display: flex;
    gap: 8px;
  }
  
  .bid-controls input {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
  }
  
  .buy-button, .bid-button {
    background-color: #27ae60;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
  }
  
  .buy-button:hover, .bid-button:hover {
    background-color: #219653;
  }
  
  .cancel-button {
    background-color: #e74c3c;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
  }
  
  .cancel-button:hover {
    background-color: #c0392b;
  }
  
  button:disabled {
    background-color: #95a5a6;
    cursor: not-allowed;
  }
  
  .loading, .empty-state {
    text-align: center;
    padding: 2rem;
    color: #777;
  }
  
  .error-message {
    background-color: #ffecec;
    color: #e74c3c;
    padding: 1rem;
    border-radius: 4px;
    margin-bottom: 1rem;
  }
  
  .action-button {
    display: inline-block;
    margin-top: 1rem;
    background-color: #3498db;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
  }
  
  .action-button:hover {
    background-color: #2980b9;
  }
  
  @media (max-width: 768px) {
    .filter-controls {
      flex-direction: column;
      align-items: stretch;
    }
    
    .listing-grid {
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    }
  }
  
  /* 뒤로 버튼 스타일 추가 */
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
</style>