// 파일 경로: src/lib/websocketClient.ts, 파일명: websocketClient.ts
import { writable } from 'svelte/store';

export const connectionStatus = writable('connecting');

const SOCKET_URL = import.meta.env.VITE_WS_ENDPOINT || 'ws://localhost:4000';
let socket: WebSocket | null = null;
let messageQueue: string[] = [];

// 재연결 관련 변수
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;
const baseReconnectDelay = 2000; // 2초

function connect() {
  socket = new WebSocket(SOCKET_URL);

  socket.addEventListener('open', () => {
    reconnectAttempts = 0; // 연결 성공 시 재연결 시도 횟수 초기화
    connectionStatus.set('open');
    // 큐에 저장된 메시지들을 모두 전송
    while (messageQueue.length) {
      const msg = messageQueue.shift();
      if (msg && socket!.readyState === WebSocket.OPEN) {
        socket!.send(msg);
      }
    }
    console.log('WebSocket 연결 성공');
  });

  socket.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(event.data);
      console.log("WS 메시지 수신:", msg);
      if (msg.type === 'forceLogout') {
        console.log("forceLogout 메시지 감지됨. payload:", msg.payload);
        // forceLogout 메시지 수신 시 window 이벤트 디스패치
        window.dispatchEvent(new CustomEvent('forceLogout', { detail: msg.payload }));
      }
      // 기존 stoneUpdate, xpUpdate, flushUpdates 메시지 처리 로직은 그대로 유지
    } catch (error) {
      console.error("WS 메시지 처리 중 오류 발생:", error);
    }
  });

  socket.addEventListener('error', (error) => {
    connectionStatus.set('error');
    console.error('WebSocket 에러:', error);
  });

  socket.addEventListener('close', () => {
    connectionStatus.set('closed');
    console.log('WebSocket 연결 종료');
    attemptReconnect();
  });
}

function attemptReconnect() {
  if (reconnectAttempts < maxReconnectAttempts) {
    reconnectAttempts++;
    const delay = baseReconnectDelay * reconnectAttempts; // 지수적으로 증가하는 딜레이 (간단한 방식)
    console.log(`WebSocket 재연결 시도 ${reconnectAttempts}번째, ${delay}ms 후 시도`);
    setTimeout(() => {
      connect();
    }, delay);
  } else {
    console.error("최대 재연결 시도 횟수를 초과했습니다. 재연결 중단.");
  }
}

// 최초 연결 호출
if (typeof window !== 'undefined' && typeof WebSocket !== 'undefined') {
  connect();
}

export function sendStoneUpdate(updateData: any) {
  const msg = JSON.stringify({
    type: 'stoneUpdate',
    payload: updateData
  });

  if (socket) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(msg);
    } else if (socket.readyState === WebSocket.CONNECTING) {
      // 만약 연결이 진행 중이면 메시지를 큐에 저장
      messageQueue.push(msg);
    } else {
      console.warn('WebSocket 연결이 아직 연결되지 않았거나 SSR 환경입니다.');
    }
  } else {
    console.warn('WebSocket이 초기화되지 않았습니다.');
  }
}

export function sendXpUpdate(xpUpdateData: { userId: string; xp: number; level: number; last_updated?: string }) {
  const msg = JSON.stringify({
    type: 'xpUpdate',
    payload: xpUpdateData
  });

  if (socket) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(msg);
    } else if (socket.readyState === WebSocket.CONNECTING) {
      messageQueue.push(msg);
    } else {
      console.warn('WebSocket 연결이 아직 연결되지 않았거나 SSR 환경입니다.');
    }
  } else {
    console.warn('WebSocket이 초기화되지 않았습니다.');
  }
}

export function sendActiveSessionUpdate(payload: { userId: string; activeSession: string }): void {
  const msg = JSON.stringify({
    type: 'activeSessionUpdate',
    payload
  });
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(msg);
  } else {
    messageQueue.push(msg);
  }
}

export function flushUpdates(): Promise<void> {
  return new Promise((resolve) => {
    const msg = JSON.stringify({ type: 'flushUpdates' });
    if (socket) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(msg);
        messageQueue = [];
        // 서버에서 업데이트 플러시를 처리할 시간을 주기 위해 약간의 지연 후 resolve 합니다.
        setTimeout(resolve, 500);
      } else if (socket.readyState === WebSocket.CONNECTING) {
        messageQueue.push(msg);
        socket.addEventListener(
          'open',
          () => {
            messageQueue = [];
            setTimeout(resolve, 500);
          },
          { once: true }
        );
      } else {
        console.warn('WebSocket 연결이 아직 연결되지 않았거나 SSR 환경입니다.');
        resolve();
      }
    } else {
      console.warn('WebSocket이 초기화되지 않았습니다.');
      resolve();
    }
  });
}

// 추가: 현재 클라이언트의 pending 메시지 큐만 클리어하는 함수
export function clearLocalMessageQueue() {
  messageQueue = [];
}

export default socket;
