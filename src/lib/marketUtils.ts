import { supabase } from '$lib/supabaseClient';

// 마켓 목록 아이템 타입 정의
export interface ListingItem {
  id: string;
  stoneId: string;
  stoneType: string;
  stoneName: string;
  stoneSize: number;
  buyNowPrice: number | null;
  minBidPrice: number | null;
  currentBidPrice: number | null;
  currentBidderId: string | null;
  isMyBid: boolean;
  isMyListing?: boolean;
  expiresAt: string;
  timeRemaining: number; // 남은 시간 (초)
  seller: {
    id: string;
  };
  status: string;
}

// 마켓 필터 타입 정의
export interface MarketFilter {
  stoneType?: string;
  minSize?: number;
  maxSize?: number;
  sortBy?: 'size' | 'name' | 'created' | 'expiry';
  sortOrder?: 'asc' | 'desc';
  listingType?: 'all' | 'buyNow' | 'auction';
}

// 스톤 데이터 인터페이스 추가
interface StoneData {
  id: string;
  type: string;
  name: string;
  size: number;
  user_id: string;
  totalElapsed: number;
}

// 현재 로그인한 사용자 ID 가져오기 (여러 함수에서 공통으로 사용)
async function getCurrentUserId(): Promise<string | null> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData?.session?.user) {
    console.error("세션 로드 실패:", sessionError);
    return null;
  }
  return sessionData.session.user.id;
}

// 사용자의 잔액 가져오기
async function getUserBalance(userId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('balance')
    .eq('id', userId)
    .single();
  
  if (error) {
    console.error("잔액 조회 실패:", error);
    return null;
  }
  
  return data.balance ? Number(data.balance) : 0;
}

// 사용자의 잔액 업데이트
async function updateUserBalance(userId: string, newBalance: number): Promise<boolean> {
  const { error } = await supabase
    .from('profiles')
    .update({ balance: newBalance })
    .eq('id', userId);
  
  if (error) {
    console.error("잔액 업데이트 실패:", error);
    return false;
  }
  
  return true;
}

// 판매 등록 함수
export async function createListing(
  stoneId: string, 
  buyNowPrice?: number, 
  minBidPrice?: number, 
  duration: number = 60
): Promise<{ success: boolean; message: string; listingId?: string }> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, message: "로그인이 필요합니다." };
    }
    
    // 판매 조건 확인
    if ((!buyNowPrice || buyNowPrice <= 0) && (!minBidPrice || minBidPrice <= 0)) {
      return { success: false, message: "즉시 구매 가격 또는 최소 입찰 가격을 설정해야 합니다." };
    }
    
    if (buyNowPrice && minBidPrice && minBidPrice >= buyNowPrice) {
      return { success: false, message: "최소 입찰 가격은 즉시 구매 가격보다 낮아야 합니다." };
    }
    
    // 돌 소유권 확인
    const { data: stone, error: stoneError } = await supabase
      .from('stones')
      .select('*')
      .eq('id', stoneId)
      .eq('user_id', userId)
      .single();
    
    if (stoneError || !stone) {
      return { success: false, message: "소유한 돌이 아니거나 존재하지 않습니다." };
    }
    
    // 현재 시간
    const now = new Date();
    
    // 만료 시간 계산 (minutes -> milliseconds)
    const expiresAt = new Date(now.getTime() + duration * 60 * 1000);
    
    // 판매 정보 등록
    const { data, error } = await supabase
      .from('market_listings')
      .insert({
        stone_id: stoneId,
        seller_id: userId,
        buy_now_price: buyNowPrice || null,
        min_bid_price: minBidPrice || null,
        current_bid_price: null,
        current_bidder_id: null,
        expires_at: expiresAt.toISOString(),
        status: 'active'
      })
      .select()
      .single();
    
    if (error) {
      return { success: false, message: "판매 등록 실패: " + error.message };
    }
    
    return { 
      success: true, 
      message: "판매 등록이 완료되었습니다.", 
      listingId: data.id 
    };
  } catch (error) {
    console.error('판매 등록 오류:', error);
    return { 
      success: false, 
      message: "오류가 발생했습니다: " + (error as Error).message 
    };
  }
}

// 내 판매 목록 가져오기
export async function getMyListings(): Promise<ListingItem[]> {
  try {
    const currentUserId = await getCurrentUserId();
    if (!currentUserId) {
      return [];
    }

    const { data, error } = await supabase
      .from('market_listings')
      .select(`
        id, stone_id, buy_now_price, min_bid_price, current_bid_price, 
        current_bidder_id, seller_id, status, expires_at, created_at,
        stones:stone_id (id, type, name, size)
      `)
      .eq('seller_id', currentUserId)
      .eq('status', 'active')
      .order('created_at', { ascending: false });
    
    if (error) {
      throw error;
    }
    
    return (data || []).map(item => {
      // 스톤 데이터 처리
      const stoneData = Array.isArray(item.stones) ? item.stones[0] : item.stones;
      const expiresAt = new Date(item.expires_at);
      const now = new Date();
      const timeRemaining = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
      
      return {
        id: item.id,
        stoneId: item.stone_id,
        stoneType: stoneData?.type || '',
        stoneName: stoneData?.name || '',
        stoneSize: stoneData?.size || 0,
        buyNowPrice: item.buy_now_price,
        minBidPrice: item.min_bid_price,
        currentBidPrice: item.current_bid_price,
        currentBidderId: item.current_bidder_id,
        isMyBid: false, // 내 판매 목록이므로 입찰은 항상 false
        isMyListing: true,
        expiresAt: item.expires_at,
        timeRemaining: timeRemaining,
        seller: {
          id: currentUserId
        },
        status: item.status
      };
    });
  } catch (error) {
    console.error('내 판매 목록 가져오기 오류:', error);
    throw error;
  }
}

// 판매 취소
export async function cancelListing(listingId: string): Promise<{ success: boolean; message: string }> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, message: "로그인이 필요합니다." };
    }
    
    // 판매 목록 조회 및 검증
    const { data: listing, error: listingError } = await supabase
      .from('market_listings')
      .select('*')
      .eq('id', listingId)
      .eq('seller_id', userId)
      .single();
    
    if (listingError || !listing) {
      return { success: false, message: "판매 목록을 찾을 수 없거나 권한이 없습니다." };
    }
    
    if (listing.status !== 'active') {
      return { success: false, message: "이미 처리된 판매 목록입니다." };
    }
    
    // 입찰자가 있는 경우 입찰금 반환
    if (listing.current_bidder_id && listing.current_bid_price) {
      const bidderBalance = await getUserBalance(listing.current_bidder_id);
      if (bidderBalance !== null) {
        const newBalance = bidderBalance + Number(listing.current_bid_price);
        await updateUserBalance(listing.current_bidder_id, newBalance);
      }
    }
    
    // 판매 취소 처리
    const { error } = await supabase
      .from('market_listings')
      .update({ status: 'cancelled' })
      .eq('id', listingId);
    
    if (error) {
      return { success: false, message: "판매 취소 실패: " + error.message };
    }
    
    return { success: true, message: "판매가 취소되었습니다." };
  } catch (error) {
    return { success: false, message: "오류가 발생했습니다: " + (error as Error).message };
  }
}

// 활성 판매 목록 가져오기
export async function getActiveListings(options: {
  stoneType?: string;
  sortBy?: 'created' | 'expiry' | 'size' | 'name';
  listingType?: 'all' | 'buyNow' | 'auction';
} = {}): Promise<ListingItem[]> {
  try {
    // 기본 쿼리
    let query = supabase
      .from('market_listings')
      .select(`
        id, stone_id, buy_now_price, min_bid_price, current_bid_price, 
        current_bidder_id, seller_id, status, expires_at, created_at,
        stones:stone_id (id, type, name, size)
      `)
      .eq('status', 'active');
    
    // 돌 종류 필터
    if (options.stoneType) {
      query = query.eq('stones.type', options.stoneType);
    }
    
    // 판매 유형 필터
    if (options.listingType === 'buyNow') {
      query = query.not('buy_now_price', 'is', null);
    } else if (options.listingType === 'auction') {
      query = query.not('min_bid_price', 'is', null);
    }
    
    // 정렬
    if (options.sortBy === 'expiry') {
      query = query.order('expires_at', { ascending: true });
    } else if (options.sortBy === 'size') {
      query = query.order('stones(size)', { ascending: false });
    } else if (options.sortBy === 'name') {
      query = query.order('stones(name)', { ascending: true });
    } else {
      query = query.order('created_at', { ascending: false });
    }
    
    // 결과 가져오기
    const { data, error } = await query;
    
    if (error) {
      throw error;
    }
    
    // 현재 사용자 ID 가져오기
    const currentUserId = await getCurrentUserId();
    
    // 만료된 항목은 반환하지 않도록 필터링
    return (data || [])
      .filter(item => {
        const expiresAt = new Date(item.expires_at);
        const now = new Date();
        return expiresAt > now; // 만료되지 않은 항목만 반환
      })
      .map(item => {
        // 스톤 데이터 처리
        const stoneData = Array.isArray(item.stones) ? item.stones[0] : item.stones;
        const expiresAt = new Date(item.expires_at);
        const now = new Date();
        const timeRemaining = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
        
        // 스톤 데이터가 없거나 비어있는 경우 기본값 설정
        const stoneName = stoneData?.name || '이름 없음';
        const stoneType = stoneData?.type || '알 수 없음';
        const stoneSize = stoneData?.size || 0;
        
        console.log('스톤 데이터:', stoneData, '판매 ID:', item.id);
        
        return {
          id: item.id,
          stoneId: item.stone_id,
          stoneType: stoneType,
          stoneName: stoneName,
          stoneSize: stoneSize,
          buyNowPrice: item.buy_now_price,
          minBidPrice: item.min_bid_price,
          currentBidPrice: item.current_bid_price,
          currentBidderId: item.current_bidder_id,
          isMyBid: !!(currentUserId && item.current_bidder_id === currentUserId),
          isMyListing: !!(currentUserId && item.seller_id === currentUserId),
          expiresAt: item.expires_at,
          timeRemaining: timeRemaining,
          seller: {
            id: item.seller_id
          },
          status: item.status
        };
      });
  } catch (error) {
    console.error('활성 판매 목록 가져오기 오류:', error);
    throw error;
  }
}

// 스톤 보관함 새로고침 함수 추가
export async function refreshStoneInventory() {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  
  if (!userId) {
    console.error('로그인 사용자 없음');
    return [];
  }
  
  // 캐시를 무시하고, 명시적으로 현재 사용자 ID로 필터링
  const { data, error } = await supabase
    .from('stones')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
    
  if (error) {
    console.error('스톤 인벤토리 새로고침 실패:', error);
    return [];
  }
  
  console.log(`사용자 ${userId}의 스톤 ${data?.length}개 로드됨`);
  return data || [];
}

// 기존 buyNow 함수 수정
export async function buyNow(listingId: string): Promise<{ success: boolean; message: string }> {
  try {
    console.log('즉시 구매 시도:', listingId);
    
    const { data, error } = await supabase.rpc('buy_now_transaction', {
      listing_id: listingId
    });
    
    if (error) {
      console.error("즉시 구매 함수 오류:", error);
      console.error("오류 세부 정보:", JSON.stringify(error, null, 2));
      
      // buyer_id 컬럼 오류인 경우 대체 방법 시도
      if (error.code === '42703' && error.message.includes('buyer_id')) {
        // 수동 구매 처리 시도
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData?.user?.id;
        
        if (!userId) {
          return { success: false, message: "로그인이 필요합니다." };
        }
        
        const { data: listing } = await supabase
          .from('market_listings')
          .select('*')
          .eq('id', listingId)
          .eq('status', 'active')
          .single();
          
        if (!listing) {
          return { success: false, message: "판매 목록을 찾을 수 없습니다." };
        }
        
        // 직접 상태 변경
        const { error: updateError } = await supabase
          .from('market_listings')
          .update({ 
            status: 'sold', 
            updated_at: new Date().toISOString() 
          })
          .eq('id', listingId);
          
        if (updateError) {
          return { success: false, message: "구매 처리 중 오류가 발생했습니다." };
        }
        
        return { success: true, message: "구매가 완료되었습니다." };
      }
      
      return { success: false, message: "구매 처리 중 오류가 발생했습니다." };
    }
    
    return data || { success: true, message: "구매가 완료되었습니다." };
  } catch (error) {
    console.error("즉시 구매 함수 오류:", error);
    return { success: false, message: "구매 처리 중 오류가 발생했습니다." };
  }
}

// 입찰
export async function placeBid(listingId: string, bidAmount: number): Promise<{ success: boolean; message: string }> {
  try {
    // 트랜잭션 시작 전 search_path 설정 추가
    const { error: pathError } = await supabase.rpc('set_search_path', { 
      path: 'public' 
    });
    
    if (pathError) {
      console.error('Search path 설정 실패:', pathError);
    }
    
    // RPC 함수로 입찰 처리
    const { data, error } = await supabase.rpc('place_bid_transaction', {
      listing_id: listingId,
      bid_amount: bidAmount
    });
    
    if (error) {
      console.error("입찰 함수 오류:", error);
      return { success: false, message: "입찰 처리 중 오류가 발생했습니다." };
    }
    
    return { success: true, message: "입찰이 완료되었습니다." };
  } catch (error) {
    console.error("입찰 함수 오류:", error);
    return { success: false, message: "입찰 처리 중 오류가 발생했습니다." };
  }
}

// 낙찰 처리
export async function finalizeAuction(listingId: string): Promise<{ success: boolean; message: string }> {
  try {
    // 트랜잭션 시작 전 search_path 설정 추가
    const { error: pathError } = await supabase.rpc('set_search_path', { 
      path: 'public' 
    });
    
    if (pathError) {
      console.error('Search path 설정 실패:', pathError);
    }
    
    // 수정된 파라미터 이름
    const { data, error: transactionError } = await supabase.rpc('finalize_auction_transaction', {
      listing_id: listingId
    });
    
    if (transactionError) {
      return { success: false, message: "낙찰 처리 중 오류가 발생했습니다: " + transactionError.message };
    }
    
    return { success: true, message: "낙찰 처리가 완료되었습니다." };
  } catch (error) {
    return { success: false, message: "오류가 발생했습니다: " + (error as Error).message };
  }
}

// 만료된 판매 목록 확인 및 처리
export async function checkExpiredListings() {
  try {
    const now = new Date().toISOString();
    
    // 만료된 항목 찾기
    const { data, error } = await supabase
      .from('market_listings')
      .select('id')
      .eq('status', 'active')
      .lt('expires_at', now);
    
    if (error) throw error;
    
    // 만료된 항목이 있으면 상태 업데이트
    if (data && data.length > 0) {
      console.log(`${data.length}개의 만료된 항목 처리 중...`);
      const ids = data.map(item => item.id);
      
      // 여러 항목을 한 번에 업데이트
      const { error: updateError } = await supabase
        .from('market_listings')
        .update({ status: 'expired' })
        .in('id', ids);
      
      if (updateError) {
        console.error('만료 처리 실패:', updateError);
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error('만료 확인 오류:', error);
    return { success: false, error };
  }
}

// 판매 목록 상세 정보 가져오기
export async function getListingDetail(listingId: string): Promise<any> {
  try {
    // 현재 사용자 ID 가져오기
    const currentUserId = await getCurrentUserId();
    
    // 로그 시작 지점
    console.log(`판매 목록 상세 정보 가져오기 시작: ${listingId}`);
    
    // 판매 목록 정보 가져오기
    const { data: listing, error } = await supabase
      .from('market_listings')
      .select(`
        *,
        seller:profiles!market_listings_seller_id_fkey(id, username),
        bidder:profiles!market_listings_current_bidder_id_fkey(id, username)
      `)
      .eq('id', listingId)
      .single();
    
    if (error) {
      console.error('판매 목록 정보 가져오기 실패:', error);
      throw new Error('판매 목록을 불러올 수 없습니다.');
    }
    
    if (!listing) {
      return null;
    }
    
    console.log('마켓 상세 정보 요청:', listingId);
    
    // directStone 변수 선언을 if 블록 밖으로 이동
    let directStone = null;
    let allStones = null;
    
    // 스톤 ID 디버깅 정보
    if (listing) {
      console.log(`스톤 ID 확인: ${listing.stone_id}`);
      
      // 스톤 ID로 직접 쿼리 수행
      const { data: stonesData, error: allStonesError } = await supabase
        .from('stones')
        .select('id, type, name')
        .limit(5);
        
      allStones = stonesData;
      console.log("전체 스톤 샘플 목록:", allStones);
      console.log("스톤 쿼리 오류:", allStonesError);
      
      // 특정 스톤 ID로 직접 쿼리
      console.log(`스톤 ID ${listing.stone_id}로 직접 쿼리 시작`);
      const { data: stoneData, error: directError } = await supabase
        .from('stones')
        .select('*')
        .eq('id', listing.stone_id)
        .single();
        
      directStone = stoneData;
      console.log("직접 쿼리 결과:", directStone);
      console.log("직접 쿼리 오류:", directError);
    }
    
    // 스톤 데이터가 null인 경우 추가 디버깅
    if (!directStone) {
      console.error(`스톤 ID ${listing.stone_id}에 대한 데이터를 찾을 수 없습니다.`);
      
      // 추가 디버깅: 해당 ID의 스톤이 DB에 존재하는지 직접 확인
      const { count, error: countError } = await supabase
        .from('stones')
        .select('*', { count: 'exact', head: true })
        .eq('id', listing.stone_id);
      
      console.log(`스톤 ID ${listing.stone_id} 존재 여부:`, count, '오류:', countError);
    }
    
    // 현재 시간 계산
    const now = new Date();
    const expiresAt = new Date(listing.expires_at);
    const timeRemaining = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
    
    // 내가 입찰했는지 여부 확인
    const isMyBid = !!(currentUserId && listing.current_bidder_id === currentUserId);
    
    // 목록 정보를 일관된 형식으로 변환
    return {
      id: listing.id,
      stoneId: listing.stone_id,
      sellerId: listing.seller_id,
      buyNowPrice: listing.buy_now_price,
      minBidPrice: listing.min_bid_price,
      currentBidPrice: listing.current_bid_price,
      currentBidderId: listing.current_bidder_id,
      expiresAt: listing.expires_at,
      status: listing.status,
      createdAt: listing.created_at,
      updatedAt: listing.updated_at,
      timeRemaining,
      seller: listing.seller || { id: listing.seller_id, username: '알 수 없음' },
      currentBidder: listing.bidder || null,
      stoneType: directStone?.type || 'unknown',
      stoneName: directStone?.name || '이름 없음',
      stoneSize: directStone?.size || 0,
      isMyBid
    };
  } catch (error) {
    console.error('판매 목록 상세 정보 가져오기 실패:', error);
    throw error;
  }
}

// 스톤 데이터 조회 부분에 예외 처리 추가
async function getStoneDetails(stoneId: string) {
  if (!stoneId) {
    console.error('스톤 ID가 유효하지 않습니다.');
    return null;
  }
  
  const { data, error } = await supabase
    .from('stones')
    .select('*')
    .eq('id', stoneId)
    .single();
    
  if (error) {
    console.error('스톤 데이터 조회 실패:', error);
    return null;
  }
  
  return data;
}
