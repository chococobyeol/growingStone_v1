// 돌 이미지 경로 생성 헬퍼 함수
export function getStoneImagePath(stoneType: string | undefined): string {
  if (!stoneType) {
    return getDefaultImagePath();
  }
  
  // stoneType이 유효한지 확인
  const validTypes = [
    'andesite', 'basalt', 'conglomerate', 'gneiss', 
    'granite', 'limestone', 'quartzite', 'sandstone', 'shale', 'tuff',
    'chert', 'diorite', 'dolomite', 'gabbro', 'marl', 'obsidian',
    'pumice', 'rhyolite', 'scoria', 'slate',
    // 오늘 추가한 돌 타입들
    'agate', 'calcite', 'feldspar', 'marble', 'mica', 'pegmatite', 'pyrite', 'quartz', 'sapphire', 'schist',
    // 신규 추가된 광물 이미지 타입들
    'bauxite', 'cassiterite', 'chalcopyrite', 'cinnabar', 'galena', 'gold', 'hematite', 'magnetite', 'malachite', 'sphalerite'
  ];
  
  if (validTypes.includes(stoneType)) {
    return `/assets/img/${stoneType}.png`;
  }
  
  return getDefaultImagePath();
}

// 이미지 로드 오류 처리를 위한 함수
export function getDefaultImagePath(): string {
  return '/assets/img/no-image.png';
}

// 보관함 이미지 경로 생성 함수
export function getCatalogImagePath(stoneType: string | undefined): string {
  return getStoneImagePath(stoneType);
}

// 프로필 이미지 경로 생성 함수
export function getProfileImagePath(imageId: string | undefined): string {
  if (!imageId) {
    return '/assets/img/default-profile.png';
  }
  return `/assets/img/profiles/${imageId}.png`;
}

// 기타 앱 아이콘 이미지 경로
export function getAppIconPath(iconName: string): string {
  return `/assets/img/icons/${iconName}.png`;
}
