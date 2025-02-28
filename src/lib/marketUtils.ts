import { supabase } from '$lib/supabaseClient';

// 마켓 목록 아이템 타입 정의
export interface ListingItem {
  id: string;
  stoneId: string;
  stoneType: string;
  stoneName: string;
  stoneSize: number;
  buyNowPrice: number | null;
  isMyListing: boolean;
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
  duration: number = 60
): Promise<{ success: boolean; message: string; listingId?: string }> {
  try {
    if (!buyNowPrice) {
      return { success: false, message: "구매 가격을 설정해야 합니다." };
    }
    
    // 돌 소유권 확인
    const { data: stone, error: stoneError } = await supabase
      .from('stones')
      .select('*')
      .eq('id', stoneId)
      .eq('user_id', await getCurrentUserId())
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
        seller_id: await getCurrentUserId(),
        buy_now_price: buyNowPrice,
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
  sortBy?: 'created' | 'expiry' | 'sizeAsc' | 'sizeDesc' | 'name';
} = {}): Promise<ListingItem[]> {
  try {
    const currentUserId = await getCurrentUserId();
    const { stoneType, sortBy = 'created' } = options;
    
    let query = supabase
      .from('market_listings')
      .select(`
        *,
        stones (*)
      `)
      .eq('status', 'active')
      .not('expires_at', 'is', null)
      .not('buy_now_price', 'is', null);
    
    // 스톤 타입 필터링
    if (stoneType) {
      query = query.eq('stones.type', stoneType);
    }
    
    // 정렬 옵션 및 데이터 반환
    if (sortBy === 'created') {
      query = query.order('created_at', { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      return formatListingData(data, currentUserId);
    } else if (sortBy === 'expiry') {
      query = query.order('expires_at', { ascending: true });
      const { data, error } = await query;
      if (error) throw error;
      return formatListingData(data, currentUserId);
    } else if (sortBy === 'sizeAsc') {
      // Supabase 외래 테이블 정렬 문법 수정
      const { data, error } = await query;
      
      if (error) throw error;
      
      // 클라이언트 측에서 정렬 - 돌 크기 오름차순
      return formatListingData(data, currentUserId).sort((a, b) => a.stoneSize - b.stoneSize);
    } else if (sortBy === 'sizeDesc') {
      // 클라이언트 측에서 정렬 - 돌 크기 내림차순
      const { data, error } = await query;
      
      if (error) throw error;
      
      return formatListingData(data, currentUserId).sort((a, b) => b.stoneSize - a.stoneSize);
    } else if (sortBy === 'name') {
      // 이름순 정렬 - 영문이 먼저 오도록 수정
      const { data, error } = await query;
      
      if (error) throw error;
      
      return formatListingData(data, currentUserId).sort((a, b) => {
        // 영문, 숫자가 한글보다 먼저 오도록 'en' 로케일 사용
        return a.stoneName.localeCompare(b.stoneName, 'en');
      });
    } else {
      // 기본 정렬 실행
      const { data, error } = await query;
      if (error) throw error;
      return formatListingData(data, currentUserId);
    }
  } catch (error) {
    console.error('활성 판매 목록 가져오기 오류:', error);
    throw error;
  }
}

// 결과 데이터 포맷팅 함수를 분리하여 코드 중복 제거
function formatListingData(data: any[], currentUserId: string | null): ListingItem[] {
  const now = new Date();
  
  return data.map(item => {
    const stoneData = Array.isArray(item.stones) ? item.stones[0] : item.stones;
    const expiresAt = new Date(item.expires_at);
    const timeRemaining = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
    
    return {
      id: item.id,
      stoneId: item.stone_id,
      stoneType: stoneData?.type || 'unknown',
      stoneName: stoneData?.name || '이름 없음',
      stoneSize: stoneData?.size || 0,
      buyNowPrice: item.buy_now_price,
      isMyListing: currentUserId === item.seller_id,
      expiresAt: item.expires_at,
      timeRemaining: timeRemaining,
      seller: {
        id: item.seller_id
      },
      status: item.status
    };
  });
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

    // 1. 리스팅 정보 조회하여 구매할 돌의 아이디 확보
    const { data: listing, error: listingError } = await supabase
      .from('market_listings')
      .select('stone_id')
      .eq('id', listingId)
      .single();
    if (listingError || !listing) {
      console.error('리스팅 정보 조회 실패:', listingError);
      return { success: false, message: '구매 정보를 불러올 수 없습니다.' };
    }

    // 2. 해당 돌의 정보를 조회 (도감 기록 등에 사용)
    const { data: stoneData, error: stoneError } = await supabase
      .from('stones')
      .select('type')
      .eq('id', listing.stone_id)
      .single();
    if (stoneError) {
      console.error('스톤 정보 조회 실패:', stoneError);
    }
    const stoneType = stoneData?.type;

    // 3. 현재 로그인한 사용자의 세션 확인
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData?.session?.user) {
      return { success: false, message: '로그인이 필요합니다.' };
    }
    const userId = sessionData.session.user.id;

    // 4. 보관함 체크: 프로필에서 storage_limit 조회
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('storage_limit')
      .eq('id', userId)
      .single();
    if (profileError || !profile) {
      return { success: false, message: '프로필 정보를 불러오는 데 실패했습니다.' };
    }
    const storageLimit = profile.storage_limit;

    // 5. 현재 사용자가 보관 중인 돌 개수 조회
    const { count, error: countError } = await supabase
      .from('stones')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (countError) {
      return { success: false, message: '보관 중인 돌 수를 가져오는 데 실패했습니다.' };
    }
    if ((count ?? 0) >= storageLimit) {
      return { success: false, message: '보관함이 가득 차 있어 구매할 수 없습니다.' };
    }

    // 6. 구매 트랜잭션 실행 (예: RPC 함수 사용)
    const { data, error } = await supabase.rpc('buy_now_transaction', {
      listing_id: listingId
    });
    if (error) {
      console.error('즉시 구매 함수 오류:', error);
      return { success: false, message: '구매 처리 중 오류가 발생했습니다.' };
    }

    // 7. 트랜잭션 성공 시 (비동기로) 도감 기록 추가
    if (stoneType) {
      import('$lib/stoneCatalogUtils').then(({ recordAcquiredStone }) => {
        recordAcquiredStone(stoneType);
      }).catch(catalogError => {
        console.error('도감 기록 추가 실패:', catalogError);
      });
    }
    return { success: true, message: '구매가 완료되었습니다.' };
  } catch (error) {
    console.error('즉시 구매 함수 예외:', error);
    return { success: false, message: '구매 처리 중 예외가 발생했습니다.' };
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
        seller:profiles!market_listings_seller_id_fkey(id, username)
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
    
    // 목록 정보를 일관된 형식으로 변환
    return {
      id: listing.id,
      stoneId: listing.stone_id,
      sellerId: listing.seller_id,
      buyNowPrice: listing.buy_now_price,
      expiresAt: listing.expires_at,
      status: listing.status,
      createdAt: listing.created_at,
      updatedAt: listing.updated_at,
      timeRemaining,
      seller: listing.seller || { id: listing.seller_id, username: '알 수 없음' },
      stoneType: directStone?.type || 'unknown',
      stoneName: directStone?.name || '이름 없음',
      stoneSize: directStone?.size || 0,
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
