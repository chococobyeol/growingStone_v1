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
    userLevel = data.profileData.level;
    userXp = data.profileData.xp;
    
    // userXpData 배열에서 현재 레벨의 데이터 찾기 (현재 레벨의 cumulativeXp를 기준으로 함)
    const currentLevelData = data.userXpData.find((item: UserXpEntry) => item.level === userLevel);
    if (currentLevelData) {
      // 레벨이 1보다 크면 이전 레벨의 누적 xp가 baseXp가 됨 (없으면 0)
      if (userLevel > 1) {
        const previousLevelData = data.userXpData.find((item: UserXpEntry) => item.level === userLevel - 1);
        baseXp = previousLevelData ? previousLevelData.cumulativeXp : 0;
      } else {
        baseXp = 0;
      }
      // 현재 레벨에서 다음 레벨까지 필요한 xp는 현재 레벨의 누적 xp에서 baseXp를 뺀 값
      levelRequirement = currentLevelData.cumulativeXp - baseXp;
      // 현재 레벨에서 획득한 xp는 전체 누적 xp에서 baseXp를 차감한 값
      currentXpProgress = userXp - baseXp;
    }
  }

  // 기존 회원 탈퇴 함수(handleAccountDeletion)를 제거하고,
  // 서버 액션 호출에 필요한 토큰을 가져오기 위한 변수 선언
  let token = '';
  let errorMessage = '';

  // 초기 세션 정보 로딩
  onMount(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    token = sessionData?.session?.access_token || '';
  });

  // 버튼 클릭 시 확인 메시지를 띄워, 취소하면 폼 제출을 막고,
  // 확인 시 숨겨진 'deleteConfirmed' 필드의 값을 "yes"로 변경합니다.
  function handleConfirm(event: MouseEvent) {
    if (!confirm($t('deleteAccountConfirmMessage'))) {
      event.preventDefault();
    } else {
      const form = (event.currentTarget as HTMLButtonElement).form;
      if (form) {
        const input = form.querySelector('input[name="deleteConfirmed"]') as HTMLInputElement;
        if (input) {
          input.value = 'yes';
        }
      }
    }
  }

  // 폼 제출 시 숨겨진 필드(deleteConfirmed)가 "yes"가 아니면 제출을 중단합니다.
  async function handleDelete(event: Event) {
    const form = event.target as HTMLFormElement;
    const input = form.querySelector('input[name="deleteConfirmed"]') as HTMLInputElement;
    if (!input || input.value !== 'yes') {
      event.preventDefault();
      return false;
    }
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.access_token) {
        errorMessage = '세션이 만료되었습니다. 다시 로그인해주세요.';
        event.preventDefault();
        return false;
      }
      
      token = sessionData.session.access_token;

      if (typeof window !== 'undefined') {
        localStorage.removeItem('activeSession');
      }

      // 클라이언트 측 로그아웃 처리 (서버 폼 액션 호출 후)
      await supabase.auth.signOut();
    } catch (error) {
      console.error('회원 탈퇴 처리 중 오류:', error);
      errorMessage = '회원 탈퇴 처리 중 오류가 발생했습니다.';
      event.preventDefault();
      return false;
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

<!-- 회원탈퇴 버튼: 폼 제출 시, handleDelete와 버튼의 on:click로 확인 처리 -->
<form method="POST" action="?/deleteAccount" use:enhance on:submit={handleDelete}>
  <!-- 삭제 확인 결과를 전달할 숨겨진 필드 (기본값 "no") -->
  <input type="hidden" name="deleteConfirmed" value="no" />
  <input type="hidden" name="token" value={token} />
  <button type="submit" name="deleteAccount" value="deleteAccount" class="delete-account-btn" on:click={handleConfirm}>
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
