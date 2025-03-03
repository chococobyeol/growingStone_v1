import { writable } from 'svelte/store';

export const isPrimary = writable(false);
export const myId = crypto.randomUUID();

// SSR 환경이 아닌 경우(window가 존재하는 경우)에만 실행
let channel: BroadcastChannel | null = null;

let claimPrimary = () => {}; // SSR에서는 빈 함수(no-op)

// 브라우저 환경에서만 실행
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  channel = new BroadcastChannel('active-session');

  channel.onmessage = (event: MessageEvent) => {
    if (event.data.type === 'claim-primary') {
      const currentPrimaryId: string = event.data.id;
      isPrimary.set(currentPrimaryId === myId);
    }
  };

  claimPrimary = () => {
    // primary 창으로 설정
    if (channel) {
      channel.postMessage({ type: 'claim-primary', id: myId });
    }
    isPrimary.set(true);
  };

  // 문서가 보이는 상태라면 primary 창을 주장
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
