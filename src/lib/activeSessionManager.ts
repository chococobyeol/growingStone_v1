// 파일 경로: src/lib/activeSessionManager.ts, 파일명: activeSessionManager.ts
import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export const isPrimary = writable(false);
// crypto.randomUUID()는 클라이언트에서도 가능하므로 브라우저에서만 실행될 수 있도록 하고, 아닐 경우 빈 문자열로 둡니다.
export const myId = browser && typeof crypto !== 'undefined' ? crypto.randomUUID() : '';

// 브라우저 환경에서만 로컬스토리지 관련 로직을 실행합니다.
if (browser) {
  const PRIMARY_KEY = 'primaryTab';
  const HEARTBEAT_INTERVAL = 2000; // 2초마다 heartbeat 전송
  const TIMEOUT = HEARTBEAT_INTERVAL * 2 + 500; // 4.5초 이상 갱신되지 않으면 만료

  function claimPrimary() {
    const now = Date.now();
    localStorage.setItem(PRIMARY_KEY, JSON.stringify({ id: myId, timestamp: now }));
  }

  function checkPrimary() {
    const primaryData = localStorage.getItem(PRIMARY_KEY);
    const now = Date.now();
    if (primaryData) {
      try {
        const { id, timestamp } = JSON.parse(primaryData);
        // 기존 primary의 heartbeat가 만료되었으면 새로 선출합니다.
        if (now - timestamp > TIMEOUT) {
          claimPrimary();
        } else if (id === myId) {
          // 이미 primary라면 heartbeat를 갱신합니다.
          claimPrimary();
        }
      } catch (e) {
        claimPrimary();
      }
    } else {
      claimPrimary();
    }
    // 현재 로컬스토리지에 있는 primary 정보를 읽어 isPrimary를 업데이트합니다.
    const primaryNow = localStorage.getItem(PRIMARY_KEY);
    if (primaryNow) {
      try {
        const { id } = JSON.parse(primaryNow);
        isPrimary.set(id === myId);
      } catch (e) {
        isPrimary.set(false);
      }
    }
  }

  // 탭이 로드될 때 우선 primary를 claim하고, 주기적으로 체크합니다.
  claimPrimary();
  setInterval(checkPrimary, HEARTBEAT_INTERVAL);

  // 다른 탭에서 PRIMARY_KEY가 변경될 때 바로 반영하도록 storage 이벤트 리스너를 추가합니다.
  window.addEventListener('storage', (event) => {
    if (event.key === PRIMARY_KEY) {
      checkPrimary();
    }
  });
}
