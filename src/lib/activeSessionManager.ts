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
    // 이미 localStorage에 다른 primary 탭의 ID가 있다면 claim하지 않습니다.
    const currentActive = localStorage.getItem('activeSession');
    if (currentActive && currentActive !== myId) return;

    if (channel) {
      channel.postMessage({ type: 'claim-primary', id: myId });
    }
    isPrimary.set(true);
    localStorage.setItem('activeSession', myId);
  };

  // localStorage에 activeSession 값이 없을 때만 primary를 claim
  if (!localStorage.getItem('activeSession') && document.visibilityState === 'visible') {
    claimPrimary();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const currentActive = localStorage.getItem('activeSession');
      // 이미 다른 탭에서 primary가 claim되어 있다면 이 탭은 무시합니다.
      if (!currentActive) {
        claimPrimary();
      } else if (currentActive === myId) {
        isPrimary.set(true);
      }
    }
  });
}

export { channel, claimPrimary };
