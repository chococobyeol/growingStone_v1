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
  
  // ★ 추가: 보유 자금 변수 선언
  let balance: number = 0;
  
  // ★ 추가: 사용자 보유 자금 불러오기 함수
  async function loadBalance() {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session?.user) {
      const { data, error } = await supabase
        .from('profiles')
        .select('balance')
        .eq('id', sessionData.session.user.id)
        .single();
      if (!error && data) {
        balance = data.balance;
      }
    }
  }
  
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
    loadMarketListings();
    loadBalance();
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
  <h1>{$t('market')}</h1>
  
  <!-- 탭 스위처 -->
  <div class="tab-switcher">
    <button 
      class={marketTab === 'buy' ? 'tab-button active' : 'tab-button'} 
      on:click={() => switchTab('buy')}
    >
      {$t('buyTab')}
    </button>
    <button 
      class={marketTab === 'sell' ? 'tab-button active' : 'tab-button'} 
      on:click={() => switchTab('sell')}
    >
      {$t('sellTab')}
    </button>
  </div>
  
  <!-- Buy Tab -->
  {#if marketTab === 'buy'}
    <!-- 필터 영역 -->
    <div class="filter-controls">
      <div class="search-box">
        <input 
          type="text" 
          bind:value={searchQuery} 
          placeholder={$t('searchPlaceholder')} 
          on:input={handleFilterChange}
        />
      </div>
      <div class="sort-controls">
        <select 
          bind:value={selectedSortBy} 
          on:change={handleFilterChange}
        >
          <option value="created">{$t('sortByCreated')}</option>
          <option value="expiry">{$t('sortByExpiry')}</option>
          <option value="sizeAsc">{$t('sortBySizeAsc')}</option>
          <option value="sizeDesc">{$t('sortBySizeDesc')}</option>
          <option value="name">{$t('sortByName')}</option>
        </select>
      </div>
    </div>
    
    <!-- 예: 탭 영역 또는 필터 영역 아래에 보유 자금 영역을 둔다 -->
    <div class="balance-wrapper">
      <div class="balance-display">
        <img class="balance-icon" src="/assets/icons/stone.png" alt={$t('stone')} />
        <span>{balance.toLocaleString()}</span>
      </div>
    </div>
    
    <!-- 판매 목록 섹션 -->
    {#if loading}
      <div class="loading">{$t('loading')}</div>
    {:else if errorMsg}
      <div class="error-message">{errorMsg}</div>
    {:else if listings.length === 0}
      <div class="empty-state">{$t('noStonesAvailable')}</div>
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
                <span class="stone-type">{$t(`stoneTypes.${listing.stoneType}`)}</span>
                <span class="stone-size">{$t('size')}: {listing.stoneSize.toFixed(2)}</span>
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
                class="buy-now-button" 
                on:click={() => handleBuyNow(listing.id)}
                disabled={processingListingId === listing.id || listing.isMyListing}
              >
                {processingListingId === listing.id ? $t('processing') : $t('buyNow')}
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {:else}
    <!-- 판매 탭 내용 -->
    <!-- 보유 자금 표시 (목록/Empty State 위쪽) -->
    <div class="balance-wrapper">
      <div class="balance-display">
        <img class="balance-icon" src="/assets/icons/stone.png" alt={$t('stone')} />
        <span>{balance.toLocaleString()}</span>
      </div>
    </div>
    
    {#if loading}
      <div class="loading">{$t('loading')}</div>
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
                <span class="stone-type">{$t(`stoneTypes.${listing.stoneType}`)}</span>
                <span class="stone-size">{$t('size')}: {listing.stoneSize.toFixed(2)}</span>
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
                {processingListingId === listing.id ? $t('processing') : $t('cancelListing')}
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  <!-- 뒤로 가기 버튼 -->
  <button class="back-btn" on:click={() => goto('/')}>{$t('backButton')}</button>

  <div class="market-actions">
    <button class="sell-button" on:click={() => goto('/market/sell')}>
      {$t('sellRegistration')}
    </button>
  </div>
</div>

<style>
  .market-container {
    max-width: 800px;
    margin: 2rem auto;
    padding: 1rem;
    text-align: center;
  }
  
  h1 {
    font-size: 2rem;
    margin-bottom: 1rem;
    text-align: center;
  }
  
  .tab-switcher {
    display: flex;
    justify-content: center;
    margin-bottom: 1.5rem;
  }
  
  .tab-button {
    padding: 0.5rem 1.5rem;
    background-color: #f0f0f0;
    border: 1px solid #ddd;
    cursor: pointer;
    transition: background-color 0.3s;
  }
  
  .tab-button.active {
    background-color: #B7DDBF;
    font-weight: bold;
  }
  
  .tab-button:first-child {
    border-radius: 4px 0 0 4px;
  }
  
  .tab-button:last-child {
    border-radius: 0 4px 4px 0;
  }
  
  .filter-controls {
    display: flex;
    justify-content: space-between;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }
  
  .filter-controls > div {
    margin: 0.5rem;
  }
  
  .search-box input {
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    width: 200px;
  }
  
  .sort-controls select {
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    background-color: white;
  }
  
  .listing-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 1rem;
    margin-top: 1rem;
  }
  
  .stone-tile {
    border: 1px solid #ddd;
    border-radius: 8px;
    overflow: hidden;
    background-color: white;
    display: flex;
    flex-direction: column;
    height: 100%;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    position: relative;
  }
  
  .stone-image {
    height: 160px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #f9f9f9;
  }
  
  .stone-image img {
    max-width: 100%;
    max-height: 150px;
    object-fit: contain;
  }
  
  .stone-info {
    padding: 0.8rem;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
  }
  
  .stone-info h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.1rem;
  }
  
  .stone-info p {
    margin: 0.2rem 0;
    font-size: 0.9rem;
  }
  
  .stone-type, .stone-size {
    display: inline-block;
    margin-right: 0.5rem;
  }
  
  .price-info {
    margin: 0.5rem 0;
  }
  
  .buy-now-price {
    font-weight: bold;
    color: #2c7a2c;
  }
  
  .time-remaining {
    font-size: 0.85rem;
    color: #666;
  }
  
  .card-actions {
    padding: 0.8rem;
    display: flex;
    justify-content: center;
    margin-top: auto;
  }
  
  .buy-now-button {
    background-color: #B7DDBF;
    color: #000;
    border: 1px solid #ddd;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    transition: background-color 0.2s;
  }
  
  .buy-now-button:hover:not(:disabled) {
    background-color: #A3CBB1;
  }
  
  .cancel-button {
    background-color: #F88A87;
    color: #000;
    border: 1px solid #ddd;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    transition: background-color 0.2s;
  }
  
  .cancel-button:hover:not(:disabled) {
    background-color: #DF7C7A;
  }
  
  .buy-now-button:disabled, .cancel-button:disabled {
    background-color: #cccccc;
    cursor: not-allowed;
  }
  
  .loading, .error-message, .empty-state {
    text-align: center;
    padding: 2rem;
    margin: 1rem 0;
    background-color: #f9f9f9;
    border-radius: 8px;
  }
  
  .error-message {
    color: #d32f2f;
  }
  
  /* 뒤로 버튼 스타일 */
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

  .market-actions {
    margin-top: 1rem;
  }

  .sell-button {
    background-color: #B7DDBF;
    color: #000;
    border: 1px solid #ddd;
    padding: 0.75rem 1.5rem;
    border-radius: 4px;
    cursor: pointer;
  }

  .sell-button:hover:not(:disabled) {
    background-color: #A3CBB1;
  }

  /* 보유 자금 영역만 왼쪽 정렬 */
  .balance-wrapper {
    text-align: left;
    margin-bottom: -0.7rem;
  }

  /* 기존 카드나 다른 영역에는 영향을 주지 않음 */
  .balance-display {
    display: inline-flex;
    align-items: center;
    background: #fff;
    padding: 0.0rem 0.5rem;
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
    font-size: 1rem;
    line-height: 1;
  }
</style>