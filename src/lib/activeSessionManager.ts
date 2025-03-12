import { writable } from 'svelte/store';

// 더 이상 active_session 기반 tab claim 기능이 필요 없으므로,
// isPrimary는 무조건 true로 설정합니다.
export const isPrimary = writable(true);

// myId는 사용하지 않으므로 빈 문자열 또는 null로 처리합니다.
export const myId = '';

let channel: BroadcastChannel | null = null;

let claimPrimary = () => {}; // SSR에서는 빈 함수(no-op)

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  channel = new BroadcastChannel('active-session');

  channel.onmessage = (event: MessageEvent) => {
    if (event.data.type === 'claim-primary') {
      const currentPrimaryId: string = event.data.id;
      isPrimary.set(currentPrimaryId === myId);
    }
  };

  claimPrimary = () => {
    // primary 탭으로 설정하고 localStorage에도 기록
    if (channel) {
      channel.postMessage({ type: 'claim-primary', id: myId });
    }
    isPrimary.set(true);
    localStorage.setItem('activeSession', myId);
  };

  // 문서가 visible 상태이면 현재 탭이 primary가 되도록 claim
  if (document.visibilityState === 'visible') {
    claimPrimary();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      claimPrimary();
    }
  });
}

export { channel, claimPrimary };
