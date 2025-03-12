import { writable } from 'svelte/store';

export const connectionStatus = writable('connecting');

const SOCKET_URL = import.meta.env.VITE_WS_ENDPOINT || 'ws://localhost:4000';
let socket: WebSocket | null = null;
let messageQueue: string[] = [];

if (typeof window !== 'undefined' && typeof WebSocket !== 'undefined') {
  socket = new WebSocket(SOCKET_URL);

  socket.addEventListener('open', () => {
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

  socket.addEventListener('error', (error) => {
    connectionStatus.set('error');
    console.error('WebSocket 에러:', error);
  });

  socket.addEventListener('close', () => {
    connectionStatus.set('closed');
    console.log('WebSocket 연결 종료');
  });
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

export function flushStoneUpdates(): Promise<void> {
  return new Promise((resolve) => {
    const msg = JSON.stringify({ type: 'flushUpdates' });
    if (socket) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(msg);
        // pending 메시지 큐를 즉시 비웁니다.
        messageQueue = [];
        // 서버에서 업데이트를 즉시 처리할 시간을 주기 위해 약간의 지연 후 resolve합니다.
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
