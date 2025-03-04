import { writable } from 'svelte/store';

export const isPrimary = writable(false);
export const myId = crypto.randomUUID();

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
