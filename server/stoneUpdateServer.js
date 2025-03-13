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

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// 사용자별 최신 돌 업데이트 요청을 저장할 객체
let updateQueue = {};

// 서버 시작 시 CSV 파일을 읽어서 userXpData에 저장 (레벨업 기준으로 사용)
// CSV 파일은 예를 들어 프로젝트의 'static' 폴더에 두고 사용합니다.
let userXpData = [];
function loadUserXpData() {
  const csvFilePath = path.resolve('static/userXpTable.csv'); // 경로는 실제 파일 위치에 맞게 수정하세요.
  try {
    const csvText = fs.readFileSync(csvFilePath, 'utf-8');
    const lines = csvText.split('\n').filter(line => line.trim() !== '');
    userXpData = lines.slice(1).map(line => {
      const [levelStr, , nextRequiredXpStr, cumulativeXpStr] = line.split(',');
      return {
        level: parseInt(levelStr),
        nextRequiredXp: parseInt(nextRequiredXpStr),
        cumulativeXp: parseInt(cumulativeXpStr)
      };
    });
    console.log('CSV 파일 로드 성공');
  } catch (error) {
    console.error('userXpTable.csv 로드 실패:', error);
  }
}
loadUserXpData();

// 사용자별 xp 업데이트 요청을 저장할 객체 (누적 delta 방식)
let xpUpdateQueue = {};

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

// xp 업데이트 처리 함수 (Debounce를 활용하여 그룹화)
async function processXpUpdates() {
  for (const userId in xpUpdateQueue) {
    const xpUpdate = xpUpdateQueue[userId]; // xpUpdate는 { delta: number } 형태임
    console.log(`[DEBUG] processXpUpdates 시작 - userId: ${userId}, 누적 delta: ${xpUpdate.delta}`);

    // DB에서 현재 프로필(xp, level) 조회
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('xp, level')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      console.error(`[DEBUG] 프로필 조회 실패 for user ${userId}:`, profileError);
      continue;
    }

    if (!profileData) {
      console.error(`[DEBUG] 프로필 데이터 없음 for user ${userId}.`);
      continue;
    }

    let currentXp = profileData.xp;
    let currentLevel = profileData.level;
    console.log(`[DEBUG] 조회된 프로필 - userId: ${userId}, 현재 xp: ${currentXp}, 현재 level: ${currentLevel}`);

    // 누적된 delta만큼 xp 증가
    const newXp = currentXp + xpUpdate.delta;
    let newLevel = currentLevel;
    console.log(`[DEBUG] 계산된 newXp: ${newXp} (현재 xp: ${currentXp} + delta: ${xpUpdate.delta})`);

    // CSV 데이터를 활용하여 레벨업 체크 (userXpData가 유효한 경우)
    if (userXpData && userXpData.length > 0) {
      const currentLevelData = userXpData.find(item => item.level === currentLevel);
      if (currentLevelData) {
        console.log(`[DEBUG] 현재 레벨 데이터 - cumulativeXp for level ${currentLevel}: ${currentLevelData.cumulativeXp}`);
        if (newXp >= currentLevelData.cumulativeXp) {
          newLevel = currentLevel + 1;
          console.log(`[DEBUG] 레벨업 조건 충족 - newLevel: ${newLevel}`);
        } else {
          console.log(`[DEBUG] 레벨업 조건 미충족 - newXp: ${newXp}, required: ${currentLevelData.cumulativeXp}`);
        }
      } else {
        console.log(`[DEBUG] 레벨업 체크를 위한 현재 레벨 데이터 미발견 (level: ${currentLevel})`);
      }
    } else {
      console.log(`[DEBUG] CSV userXpData 없음`);
    }

    // profiles 테이블 업데이트
    const { error } = await supabase
      .from('profiles')
      .update({ xp: newXp, level: newLevel })
      .eq('id', userId);

    if (error) {
      console.error(`[DEBUG] XP 업데이트 실패 for user ${userId}:`, error);
    } else {
      console.log(`[DEBUG] XP 업데이트 성공 for user ${userId}: 새 xp: ${newXp}, 새 level: ${newLevel}`);
    }
  }
  xpUpdateQueue = {};
}

// Debounce 시간 1000ms(1초)로 설정하여 요청들을 그룹화합니다.
const debouncedProcessUpdates = debounce(processUpdates, 1000);
const debouncedProcessXpUpdates = debounce(processXpUpdates, 1000);

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message.toString());
      if (msg.type === 'stoneUpdate') {
        const payload = msg.payload;
        updateQueue[payload.user_id] = payload;
        debouncedProcessUpdates();
      } else if (msg.type === 'xpUpdate') {
        const payload = msg.payload;
        // 클라이언트가 이제 { userId, delta } 형태로 메시지를 전송합니다.
        if (xpUpdateQueue[payload.userId]) {
          xpUpdateQueue[payload.userId].delta += payload.delta;
        } else {
          xpUpdateQueue[payload.userId] = { delta: payload.delta };
        }
        debouncedProcessXpUpdates();
      } else if (msg.type === 'flushUpdates') {
        console.log('플러시 요청 수신: pending 업데이트를 즉시 처리합니다.');
        debouncedProcessUpdates.flush();
        debouncedProcessXpUpdates.flush();
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
