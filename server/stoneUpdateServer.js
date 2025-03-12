import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import debounce from 'lodash.debounce';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// 사용자별 최신 업데이트 요청을 저장할 객체
let updateQueue = {};

// DB 업데이트 처리 함수 (Debounce를 활용하여 그룹화하여 처리)
async function processUpdates() {
  for (const userId in updateQueue) {
    const stoneUpdate = updateQueue[userId];

    // DB에서 해당 돌의 discovered_at과 last_updated 값을 조회 (last_updated 비교를 위해)
    const { data: existingStone, error: fetchError } = await supabase
      .from('stones')
      .select('discovered_at, last_updated')
      .eq('id', stoneUpdate.id)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('기존 돌 조회 실패:', fetchError);
    }

    // 만약 돌이 존재하고 클라이언트가 보낸 last_updated가 DB의 last_updated 보다 이전이면 업데이트를 무시
    if (existingStone && existingStone.last_updated && stoneUpdate.last_updated) {
      const dbLastUpdated = new Date(existingStone.last_updated);
      const clientLastUpdated = new Date(stoneUpdate.last_updated);
      if (clientLastUpdated <= dbLastUpdated) {
        console.log(`Outdated update ignored for user ${userId}`);
        continue;
      }
    }

    // 업데이트 객체 생성: 클라이언트의 last_updated를 그대로 반영
    const updateObject = {
      id: stoneUpdate.id,
      type: stoneUpdate.type,
      size: stoneUpdate.baseSize,
      totalElapsed: stoneUpdate.totalElapsed || 0,
      name: stoneUpdate.name,
      user_id: userId,
      last_updated: stoneUpdate.last_updated ? stoneUpdate.last_updated : new Date().toISOString()
    };

    // 돌이 새로 생성되는 경우에만 discovered_at 추가
    if (!existingStone) {
      updateObject.discovered_at = new Date().toISOString();
    }

    const { error } = await supabase.from('stones').upsert(updateObject);
    if (error) {
      console.error('DB 업데이트 실패:', error);
    } else {
      console.log(`DB 업데이트 성공 for user ${userId}`);
    }
  }
  updateQueue = {};
}

// Debounce 시간 1000ms(1초)로 설정하여 짧은 시간 내의 요청을 그룹화
const debouncedProcessUpdates = debounce(processUpdates, 1000);

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message.toString());
      if (msg.type === 'stoneUpdate') {
        const payload = msg.payload;
        // 클라이언트가 반드시 last_updated 필드를 포함시켜야 합니다.
        updateQueue[payload.user_id] = payload;
        debouncedProcessUpdates();
      } else if (msg.type === 'flushUpdates') {
        console.log('플러시 요청 수신: pending 업데이트를 즉시 처리합니다.');
        debouncedProcessUpdates.flush();
      }
    } catch (error) {
      console.error('메시지 처리 실패:', error);
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`웹소켓 서버가 포트 ${PORT}에서 실행 중입니다.`);
});
