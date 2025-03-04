import { writable } from 'svelte/store';

export const isPrimary = writable(false);
export const myId = crypto.randomUUID();

let claimPrimary = () => {};

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  // 초기 로드 시 기존의 활성 세션 정보를 제거하여 새롭게 primary를 claim하도록 함
  localStorage.removeItem('activeSession');

  claimPrimary = () => {
    if (document.visibilityState !== 'visible') return;
    localStorage.setItem('activeSession', myId);
    isPrimary.set(true);
  };

  // localStorage의 activeSession 변경을 감지하여 현재 탭의 primary 여부를 업데이트
  window.addEventListener('storage', (event: StorageEvent) => {
    if (event.key === 'activeSession') {
      const active = event.newValue;
      isPrimary.set(active === myId);
    }
  });

  // 페이지 로드 시와 탭이 활성화될 때 primary를 claim
  if (document.visibilityState === 'visible') {
    claimPrimary();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      claimPrimary();
    }
  });
}

export { claimPrimary };
