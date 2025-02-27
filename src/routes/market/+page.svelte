<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { t, locale } from 'svelte-i18n';
  import { supabase } from '$lib/supabaseClient';
  import { getActiveListings, getMyListings, checkExpiredListings, buyNow, cancelListing } from '$lib/marketUtils';
  import { getStoneImagePath, getDefaultImagePath } from '$lib/imageUtils';
  import type { ListingItem } from '$lib/marketUtils';
  import type { RealtimeChannel } from '@supabase/supabase-js';
  
  let listings: ListingItem[] = [];
  let myListings: ListingItem[] = [];
  let loading = true;
  let errorMsg = '';
  let selectedSortBy: 'created' | 'expiry' | 'sizeAsc' | 'sizeDesc' | 'name' = 'created';
  let refreshInterval: ReturnType<typeof setInterval>;
  let marketSubscription: RealtimeChannel;
  let currentUserId: string | null = null;
  let processingListingId: string | null = null;
  
  // 새로 추가: 마켓 탭 상태 (buy=구매, sell=판매)
  let marketTab = 'buy';
  
  // 필터 옵션
  let searchQuery = '';
  
  // 돌 종류 상수 정의
  const stoneTypes = {
    granite: '화강암',
    marble: '대리석',
    basalt: '현무암',
    sandstone: '사암',
    schist: '편암'
  };
  
  // 초기 로딩 함수 - 구매 탭
  async function loadMarketListings() {
    loading = true;
    errorMsg = '';
    try {
      // 먼저 만료된 목록 처리
      await checkExpiredListings();
      
      // 그 다음 목록 로딩
      listings = await getActiveListings({
        sortBy: selectedSortBy as any,
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
      await buyNow(listingId);
      await loadMarketListings();
    } catch (error) {
      alert($t('purchaseError'));
    } finally {
      processingListingId = null;
    }
  }
  
  // 판매 취소 처리
  async function handleCancelListing(listingId: string) {
    if (!confirm($t('confirmCancelListing')) || processingListingId) return;
    
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
        alert($t('cancelSaleError'));
      }
    } catch (error) {
      alert($t('cancelSaleError'));
    } finally {
      processingListingId = null;
    }
  }
  
  // 필터 옵션 적용
  function applyFilters() {
    getActiveListings({
      sortBy: selectedSortBy,
    })
    .then(data => {
      listings = data;
      // 검색어 적용
      if (searchQuery) {
        listings = listings.filter(item => {
          const nameMatch = item.stoneName.toLowerCase().includes(searchQuery.toLowerCase());
          const typeMatchEn = item.stoneType.toLowerCase().includes(searchQuery.toLowerCase());
          
          // 한글 타입명으로 검색 개선
          const koreanType = $t(`stoneTypes.${item.stoneType}`);
          const typeMatchKo = koreanType && koreanType.toLowerCase().includes(searchQuery.toLowerCase());
          
          return nameMatch || typeMatchEn || typeMatchKo;
        });
      }
    })
    .catch(error => {
      errorMsg = $t('loadingListingsError');
    });
  }
  
  // 필터링 필드 변경 핸들러
  function handleFilterChange() {
    applyFilters();
  }
  
  // 뒤로 가기 및 새로고침 시 상태 유지 (옵션)
  onMount(() => {
    loadListings();
  });

  function loadListings() {
    loading = true;
    getActiveListings({
      sortBy: selectedSortBy,
    })
    .then(data => {
      listings = data;
      loading = false;
    })
    .catch(error => {
      errorMsg = $t('loadingListingsError');
      loading = false;
    });
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
        async (payload) => {
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
          sortBy: selectedSortBy as any,
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

  // 실시간 업데이트 처리
  function setupRealTimeSubscription() {
    marketSubscription = supabase
      .channel('market-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'market_listings' }, 
        async (payload) => {
          console.log('마켓 데이터 변경 감지:', payload);
          if (marketTab === 'buy') {
            const newListings = await getActiveListings({
              sortBy: selectedSortBy as any,
            });
            
            // 검색어가 있는 경우 필터링 적용
            if (searchQuery) {
              listings = newListings.filter(item => {
                const nameMatch = item.stoneName.toLowerCase().includes(searchQuery.toLowerCase());
                const typeMatchEn = item.stoneType.toLowerCase().includes(searchQuery.toLowerCase());
                const koreanType = $t(`stoneTypes.${item.stoneType}`);
                const typeMatchKo = koreanType && koreanType.toLowerCase().includes(searchQuery.toLowerCase());
                return nameMatch || typeMatchEn || typeMatchKo;
              });
            } else {
              listings = newListings;
            }
          }
        })
      .subscribe();
  }
</script>

<div class="market-container">
  <h1>{$t('stoneMarket')}</h1>
  
  <div class="market-actions">
    <button class="sell-button" on:click={() => goto('/market/sell')}>{$t('sellRegistration')}</button>
  </div>
  
  <div class="tabs">
    <button 
      class={`tab ${marketTab === 'buy' ? 'active' : ''}`} 
      on:click={() => switchTab('buy')}
    >
      {$t('buy')}
    </button>
    <button 
      class={`tab ${marketTab === 'sell' ? 'active' : ''}`} 
      on:click={() => switchTab('sell')}
    >
      {$t('mySalesList')}
    </button>
  </div>
  
  {#if marketTab === 'buy'}
    <!-- 검색 바를 상단으로 이동 -->
    <div class="search-container">
      <input 
        type="text" 
        placeholder={$t('searchByNameOrType')}
        bind:value={searchQuery} 
        on:input={handleFilterChange}
        class="search-input"
      />
    </div>
    
    <div class="filters">
      <!-- 정렬 옵션 -->
      <div class="filter-group">
        <label for="sortBy">{$t('sortBy')}</label>
        <select id="sortBy" bind:value={selectedSortBy} on:change={handleFilterChange}>
          <option value="created">{$t('latestFirst')}</option>
          <option value="expiry">{$t('expiryImminent')}</option>
          <option value="sizeAsc">{$t('sizeAscending')}</option>
          <option value="sizeDesc">{$t('sizeDescending')}</option>
          <option value="name">{$t('nameOrder')}</option>
        </select>
      </div>
    </div>
    
    <!-- 구매 탭 내용 -->
    {#if loading}
      <div class="loading">로딩 중...</div>
    {:else if errorMsg}
      <div class="error-message">{errorMsg}</div>
    {:else if listings.length === 0}
      <div class="empty-state">
        {$t('noStonesOnSale')}
        <button on:click={() => goto('/market/sell')} class="action-button">
          {$t('sellStoneButton')}
        </button>
      </div>
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
                  <p class="buy-now-price">{$t('buyNowPrice')}: {listing.buyNowPrice} {$t('stone')}</p>
                {/if}
              </div>
              <p class="time-remaining">{$t('remainingTime')}: {formatTimeRemaining(listing.timeRemaining)}</p>
            </div>
            
            <div class="card-actions">
              {#if currentUserId && currentUserId !== listing.seller.id}
                {#if listing.buyNowPrice && !listing.isMyListing && listing.seller.id !== currentUserId}
                  <button 
                    class="buy-button"
                    on:click={() => handleBuyNow(listing.id)}
                    disabled={processingListingId === listing.id}
                  >
                    {$t('buyNow')}
                  </button>
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
      <div class="empty-state">{$t('noStonesOnSale')}</div>
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
                  <p class="buy-now-price">{$t('buyNowPrice')}: {listing.buyNowPrice} {$t('stone')}</p>
                {/if}
              </div>
              <p class="time-remaining">{$t('remainingTime')}: {formatTimeRemaining(listing.timeRemaining)}</p>
            </div>
            
            <div class="card-actions">
              <button 
                class="cancel-button" 
                on:click={() => handleCancelListing(listing.id)}
                disabled={processingListingId === listing.id}
              >
                {processingListingId === listing.id ? '처리 중...' : $t('cancelListing')}
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
  
  .tabs {
    display: flex;
    border-bottom: 1px solid #ddd;
    margin-bottom: 1rem;
  }
  
  .tab {
    padding: 0.75rem 1.5rem;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    border-bottom: 3px solid transparent;
  }
  
  .tab.active {
    border-bottom: 3px solid #3498db;
    font-weight: bold;
  }
  
  .filters {
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
  
  .buy-now-price {
    margin: 0.2rem 0;
    font-weight: bold;
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
  
  .buy-button {
    background-color: #27ae60;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
  }
  
  .buy-button:hover {
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
    .filters {
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
  
  .search-container {
    margin: 1rem 0;
    width: 100%;
  }
  
  .search-input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 1rem;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  }
</style>