// 파일 경로: server/stoneUpdateServer.js, 파일명: stoneUpdateServer.js
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import debounce from 'lodash.debounce';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// SvelteKit에서 빌드된 HTTP 핸들러를 가져옵니다.
// 이 예제에서는 프로젝트 루트의 build 폴더 내 handler.js 파일을 사용합니다.
import { handler } from '../build/handler.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const app = express();

// 모든 HTTP 요청을 SvelteKit 핸들러로 전달합니다.
// 이로 인해 "/" 경로에 대한 404 오류가 발생하지 않습니다.
app.use(handler);

// 만약 추가적인 Express 미들웨어나 라우팅이 필요하다면 이곳에 작성할 수 있습니다.

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// 사용자별 최신 돌 업데이트 요청을 저장할 객체
let updateQueue = {};

// // 서버 시작 시 CSV 파일을 읽어서 userXpData에 저장 (레벨업 기준으로 사용)
// // CSV 파일은 예를 들어 프로젝트의 'static' 폴더에 두고 사용합니다.
// let userXpData = [];
// function loadUserXpData() {
//   const csvFilePath = path.resolve('static/userXpTable.csv'); // 경로는 실제 파일 위치에 맞게 수정하세요.
//   try {
//     const csvText = fs.readFileSync(csvFilePath, 'utf-8');
//     const lines = csvText.split('\n').filter(line => line.trim() !== '');
//     userXpData = lines.slice(1).map(line => {
//       const [levelStr, , nextRequiredXpStr, cumulativeXpStr] = line.split(',');
//       return {
//         level: parseInt(levelStr),
//         nextRequiredXp: parseInt(nextRequiredXpStr),
//         cumulativeXp: parseInt(cumulativeXpStr)
//       };
//     });
//     console.log('CSV 파일 로드 성공');
//   } catch (error) {
//     console.error('userXpTable.csv 로드 실패:', error);
//   }
// }
// loadUserXpData();


// stone 업데이트 처리 함수 (Debounce를 활용하여 그룹화)
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
      size: stoneUpdate.size,
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
      console.error('stones DB 업데이트 실패:', error);
    } else {
      console.log(`stones DB 업데이트 성공 for user ${userId}`);
    }
  }
  updateQueue = {};
}


// 사용자별 xp 업데이트 요청을 저장할 객체
let xpUpdateQueue = {};

// Xp 업데이트 처리 함수 (Debounce를 활용하여 그룹화)
async function processXpUpdates() {
  for (const userId in xpUpdateQueue) {
    const xpUpdate = xpUpdateQueue[userId];

    // DB에서 해당 사용자의 last_updated 값을 조회
    const { data: existingXp, error: fetchError } = await supabase
      .from('profiles')
      .select('last_updated')
      .eq('id', userId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('기존 사용자 조회 실패:', fetchError);
    }

    // 클라이언트가 보낸 last_updated가 DB의 값보다 오래된 경우 업데이트 무시
    if (existingXp && existingXp.last_updated && xpUpdate.last_updated) {
      const dbLastUpdated = new Date(existingXp.last_updated);
      const clientLastUpdated = new Date(xpUpdate.last_updated);
      if (clientLastUpdated <= dbLastUpdated) {
        console.log(`Outdated update ignored for user ${userId}`);
        continue;
      }
    }

    // update 객체에서 user_id 프로퍼티 제거 (id 프로퍼티만 사용)
    const updateObject = {
      xp: xpUpdate.xp,
      level: xpUpdate.level,
      last_updated: xpUpdate.last_updated ? xpUpdate.last_updated : new Date().toISOString()
    };

    // id를 조건으로 해서 업데이트 실행
    const { error } = await supabase
      .from('profiles')
      .update(updateObject)
      .eq('id', userId);
    if (error) {
      console.error('profiles DB 업데이트 실패:', error);
    } else {
      console.log(`profiles DB 업데이트 성공 for user ${userId}`);
    }
  }
  xpUpdateQueue = {};
}


// Debounce 시간 1000ms(1초)로 설정하여 요청들을 그룹화합니다.
const debouncedProcessUpdates = debounce(processUpdates, 1000);
const debouncedProcessXpUpdates = debounce(processXpUpdates, 1000);

wss.on('connection', (ws) => {
  ws.on('message', async (message) => {
    try {
      const msg = JSON.parse(message.toString());
      if (msg.type === 'stoneUpdate') {
        const payload = msg.payload;
        updateQueue[payload.user_id] = payload;
        debouncedProcessUpdates();
      } else if (msg.type === 'xpUpdate') {
        const payload = msg.payload;
        // 클라이언트에서 계산한 절대 xp와 level 정보를 그대로 사용합니다.
        xpUpdateQueue[payload.userId] = payload;
        debouncedProcessXpUpdates();
      } else if (msg.type === 'activeSessionUpdate') {
        const { userId, activeSession } = msg.payload;
        // 현재 연결(ws)에 userId 정보를 할당
        ws.userId = userId;

        console.log(`[DEBUG] activeSessionUpdate 수신 - userId: ${userId}, activeSession: ${activeSession}`);
        
        const { data: profileData, error } = await supabase
          .from('profiles')
          .select('active_session')
          .eq('id', userId)
          .single();
        
        if (error || !profileData) {
          console.error(`[DEBUG] 프로필 데이터 조회 실패 for user ${userId}:`, error);
        } else {
          const storedSession = profileData.active_session;
          console.log(`[DEBUG] DB에서 가져온 active_session: ${storedSession}, 새 activeSession: ${activeSession}`);
          if (storedSession && storedSession !== activeSession) {
            console.log(`[DEBUG] active_session 충돌 발생: 기존 ${storedSession} vs 새 ${activeSession}. forceLogout 메시지 전송 시도합니다.`);
            wss.clients.forEach((client) => {
              console.log(`[DEBUG] 클라이언트 체크: client.userId=${client.userId} (대상 userId: ${userId})`);
              if (client !== ws && client.userId === userId) {
                client.send(JSON.stringify({ type: 'forceLogout', payload: { reason: '다른 기기에서 로그인' } }));
                console.log(`[DEBUG] forceLogout 메시지 전송 완료: 대상 클라이언트 userId=${client.userId}`);
              }
            });
          }
          const { error: updateError } = await supabase
            .from('profiles')
            .update({ active_session: activeSession })
            .eq('id', userId);
          if (updateError) {
            console.error(`[DEBUG] DB 업데이트 실패:`, updateError);
          } else {
            console.log(`[DEBUG] DB active_session 업데이트 성공: ${activeSession}`);
          }
        }
      } else if (msg.type === 'flushUpdates') {
        console.log('플러시 요청 수신: pending 업데이트를 즉각 처리합니다.');
        await flushAllUpdates();
      }
    } catch (err) {
      console.error("메시지 처리 중 예외 발생:", err);
    }
  });
});

// 두 debounced 함수의 flush를 동기화(Curently 동시에 실행)할 수 있도록 flushAllUpdates 함수를 추가합니다.
async function flushAllUpdates() {
  await Promise.all([
    debouncedProcessUpdates.flush(),
    debouncedProcessXpUpdates.flush()
  ]);
}

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`웹소켓 서버가 포트 ${PORT}에서 실행 중입니다.`);
});
