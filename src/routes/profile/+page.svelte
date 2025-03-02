<script lang="ts">
  export let data: {
    profileData: { xp: number; level: number } | null,
    userXpData: { level: number; nextRequiredXp: number; cumulativeXp: number }[]
  };

  import { goto } from '$app/navigation';
  import { t } from 'svelte-i18n';
  import { supabase } from '$lib/supabaseClient';
  import { onMount } from 'svelte';
  import { enhance } from '$app/forms';
  import { session } from '$lib/authStore';
  import type { SubmitFunction } from '@sveltejs/kit';
  import type { ActionResult } from '@sveltejs/kit';

  // 사용자 프로필 정보 변수들
  let userLevel = 1;
  let userXp = 0;
  let baseXp = 0;
  let levelRequirement = 0;
  let currentXpProgress = 0;

  type UserXpEntry = {
    level: number;
    nextRequiredXp: number;
    cumulativeXp: number;
  };

  if (data.profileData) {
    // 누적 경험치
    userXp = data.profileData.xp;

    // 누적 경험치를 기반으로 레벨 계산을 수행합니다.
    // userXpData를 레벨 순서대로 정렬 (만약 정렬되어 있지 않다면)
    const sortedXpData = [...data.userXpData].sort((a, b) => a.level - b.level);

    // 초기값 설정: 레벨 1의 경우 baseXp는 0, 필요 경험치는 레벨 1의 cumulativeXp 기준
    let calculatedLevel = sortedXpData[0].level;
    let baseXpCalc = 0; // 레벨 1일 경우 0
    let requiredXp = sortedXpData[0].cumulativeXp; // 레벨 1 달성을 위한 기준 xp

    // userXpData를 순회하면서, 사용자가 누적 xp 기준 어느 레벨에 해당하는지 계산합니다.
    for (let i = 0; i < sortedXpData.length; i++) {
      const entry = sortedXpData[i];
      // 레벨 1의 경우에는 baseXpCalc가 그대로 0
      if (i > 0) {
        baseXpCalc = sortedXpData[i - 1].cumulativeXp;
      }
      // 만약 사용자의 xp가 현재 레벨의 cumulativeXp보다 작다면, 이 레벨이 현재 사용자 레벨
      if (userXp < entry.cumulativeXp) {
        calculatedLevel = entry.level;
        requiredXp = entry.cumulativeXp - baseXpCalc;
        currentXpProgress = userXp - baseXpCalc;
        break;
      }
      // 배열의 마지막 원소까지 돌았을 경우, 사용자의 xp가 가장 높은 레벨의 기준을 넘었으므로,
      // 해당 레벨로 설정하고, 필요 경험치는 이전 레벨 기준에서 계산
      if (i === sortedXpData.length - 1) {
        calculatedLevel = entry.level;
        requiredXp = entry.cumulativeXp - baseXpCalc;
        currentXpProgress = userXp - baseXpCalc;
      }
    }
    userLevel = calculatedLevel;
    levelRequirement = requiredXp;
  }

  // 기존 회원 탈퇴 함수(handleAccountDeletion)를 제거하고,
  // 서버 액션 호출에 필요한 토큰을 가져오기 위한 변수 선언
  let token = '';
  let errorMessage = '';

  // 초기 세션 정보를 불러와 최신 토큰 값을 유지합니다.
  onMount(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    token = sessionData?.session?.access_token || '';
  });

  // 버튼 클릭 시 회원 탈퇴 전 확인, 토큰 갱신, 그리고 폼 제출을 직접 처리합니다.
  async function handleDeleteClick(event: Event) {
    event.preventDefault();
    errorMessage = '';
    
    if (!confirm($t('deleteAccountConfirmMessage'))) return;

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw new Error(sessionError.message);
      
      if (!sessionData?.session?.access_token) {
        errorMessage = '세션이 만료되었습니다. 다시 로그인해주세요.';
        return;
      }
      
      token = sessionData.session.access_token;
      
      // deleteConfirmed 값을 직접 설정하고 폼 제출
      const formElement = document.querySelector('form') as HTMLFormElement;
      const deleteConfirmedInput = formElement.querySelector('input[name="deleteConfirmed"]') as HTMLInputElement;
      deleteConfirmedInput.value = 'yes';
      
      // 폼 데이터 직접 생성 및 전송
      const formData = new FormData(formElement);
      const response = await fetch('?/deleteAccount', {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      if (result.error) {
        throw new Error(result.message);
      }
      
      // 성공 시 즉시 로그아웃 및 리다이렉션
      await supabase.auth.signOut();
      localStorage.removeItem('activeSession');
      session.set(null);
      window.location.href = '/login';
      
    } catch (error) {
      errorMessage = (error as Error).message;
    }
  }
</script>

<div class="profile-container">
  <h1>{$t('profile')}</h1>
  <p>{$t('level')}: {userLevel}</p>
  
  <div class="xp-bar-container">
    <div class="progress-wrapper">
      <progress value={currentXpProgress} max={levelRequirement}></progress>
      <span class="progress-text">
        {$t('xpLabel')} {currentXpProgress} / {levelRequirement}
      </span>
    </div>
    <p class="total-xp">{$t('totalXp')}: {userXp}</p>
  </div>
</div>

<!-- 뒤로가기 버튼 -->
<button class="back-btn" on:click={() => goto('/')}>{$t('backButton')}</button>

<!-- 회원 탈퇴 폼: use:enhance 옵션을 통해 서버 액션 결과를 수신 -->
<form method="POST" action="?/deleteAccount">
  <input type="hidden" name="deleteConfirmed" value="no">
  <input type="hidden" name="token" bind:value={token}>
  <button type="button" class="delete-account-btn" on:click={handleDeleteClick}>
    {$t('deleteAccount')}
  </button>
</form>

{#if errorMessage}
  <p class="error">{errorMessage}</p>
{/if}

<style>
  .profile-container {
    max-width: 600px;
    margin: 2rem auto;
    padding: 1rem;
    text-align: center;
  }
  
  h1 {
    font-size: 2rem;
    margin-bottom: 1rem;
  }
  
  p {
    font-size: 1.1rem;
    margin: 0.5rem 0;
  }
  
  .xp-bar-container {
    margin: 2rem 0;
    text-align: center;
  }
  
  .progress-wrapper {
    position: relative;
    width: 100%;
  }
  
  progress {
    width: 100%;
    height: 25px;
    -webkit-appearance: none;
    appearance: none;
  }
  
  progress::-webkit-progress-bar {
    background-color: #eee;
    border-radius: 5px;
  }
  
  progress::-webkit-progress-value {
    background-color: #B7DDBF;
    border-radius: 5px;
  }
  
  .progress-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-weight: bold;
    color: #000;
  }
  
  .total-xp {
    color: #666;
    font-size: 0.95rem;
    margin-top: 0.5rem;
  }
  
  .back-btn {
    position: fixed;
    bottom: 20px;
    left: 20px;
    background: #D7D4CD;
    color: #000;
    padding: 0.5rem 1rem;
    border: 1px solid #DDDDDD;
    border-radius: 4px;
    z-index: 1000;
    cursor: pointer;
  }

  .delete-account-btn {
    background-color: #F88A87;
    color: #fff;
    padding: 0.6rem 1.2rem;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    margin: 1rem auto;
    display: block;
    max-width: 300px;
    transition: background-color 0.3s ease;
  }
  
  .delete-account-btn:hover {
    background-color: #E27675;
  }
  
  .error {
    color: red;
    text-align: center;
    margin-top: 1rem;
  }
</style>
