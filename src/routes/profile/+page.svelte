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

  // 새 변수: 비밀번호 변경 모달 표시 여부
  let showPasswordModal = false;

  // 이메일/비밀번호 방식 가입자 여부, newPassword, confirmNewPassword, passwordError, passwordSuccess 등 기존 변수들은 그대로 유지합니다.
  let isEmailUser = false;
  let newPassword = '';
  let confirmNewPassword = '';
  let passwordError = '';
  let passwordSuccess = '';

  // 기존 onMount에서 세션 정보를 통해 isEmailUser 값을 판별합니다.
  onMount(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    token = sessionData?.session?.access_token || '';
    if (sessionData?.session?.user) {
      const user = sessionData.session.user;
      if (user.identities && user.identities.length > 0) {
        isEmailUser = user.identities[0].provider === 'email';
      } else {
        // provider 정보가 없으면 기본적으로 email 사용자로 가정합니다.
        isEmailUser = true;
      }
    }
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

  // 비밀번호 변경 함수
  async function handlePasswordChange(event: Event) {
    event.preventDefault();
    passwordError = '';
    passwordSuccess = '';

    if (newPassword !== confirmNewPassword) {
      passwordError = $t('passwordMismatch');
      return;
    }
    if (newPassword.length < 6) {
      passwordError = $t('passwordTooShort');
      return;
    }

    const { data, error } = await supabase.auth.updateUser({
      password: newPassword
    });
    if (error) {
      passwordError = error.message;
    } else {
      passwordSuccess = $t('passwordChangeSuccess');
      newPassword = '';
      confirmNewPassword = '';
      // 모달 닫기
      showPasswordModal = false;
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

<!-- 이메일 로그인 사용자인 경우에만 비밀번호 변경 버튼 표시 -->
{#if isEmailUser}
  <button class="btn" on:click={() => showPasswordModal = true}>{$t('changePassword')}</button>
{/if}

<!-- 회원 탈퇴 폼: use:enhance 옵션을 통해 서버 액션 결과를 수신 -->
<form method="POST" action="?/deleteAccount">
  <input type="hidden" name="deleteConfirmed" value="no">
  <input type="hidden" name="token" bind:value={token}>
  <button type="button" class="delete-account-btn" on:click={handleDeleteClick}>
    {$t('deleteAccount')}
  </button>
</form>

<!-- 모달 창: 사용자가 버튼을 누르면 나타납니다. -->
{#if showPasswordModal}
  <div class="modal-wrapper">
    <!-- 전체 화면을 덮는 버튼(오버레이) -->
    <button
      type="button"
      class="modal-overlay"
      on:click={() => (showPasswordModal = false)}
    >
      <span class="sr-only">{$t('closeModal')}</span>
    </button>
    <!-- 모달 창 내용 -->
    <div class="modal-content" role="dialog" aria-modal="true">
      <button
        type="button"
        class="modal-close-btn"
        on:click={() => (showPasswordModal = false)}
      >
        ×
      </button>
      {#if isEmailUser}
        <form on:submit|preventDefault={handlePasswordChange}>
          <div class="input-group">
            <label for="newPassword">{$t('newPassword')}</label>
            <input id="newPassword" type="password" bind:value={newPassword} required />
          </div>
          <div class="input-group">
            <label for="confirmNewPassword">{$t('confirmNewPassword')}</label>
            <input id="confirmNewPassword" type="password" bind:value={confirmNewPassword} required />
          </div>
          {#if passwordError}
            <p class="error">{passwordError}</p>
          {/if}
          {#if passwordSuccess}
            <p class="success">{passwordSuccess}</p>
          {/if}
          <button type="submit" class="btn">{$t('changePassword')}</button>
        </form>
      {:else}
        <p>{$t('passwordChangeUnavailable')}</p>
      {/if}
    </div>
  </div>
{/if}

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

  /* 비밀번호 변경 버튼의 공통 스타일 */
  .btn {
    background-color: #B7DDBF;
    color: #000;
    border: 1px solid #ddd;
    padding: 0.6rem 1.2rem;
    border-radius: 5px;
    cursor: pointer;
    margin: 1rem auto;
    display: block;
    max-width: 300px;
    transition: background-color 0.3s ease, border-color 0.3s ease;
  }
  
  .btn:hover {
    background-color: #A3CBB1;
  }
  
  /* 회원탈퇴 버튼 스타일:
     - 배경색: #F88A87 (유지)
     - 글자색: 검은색 (#000)
     - 테두리: 1px solid #ddd */
  .delete-account-btn {
    background-color: #F88A87;
    color: #000;  /* 글자색을 검은색으로 변경 */
    border: 1px solid #ddd; /* 테두리 색상 */
    padding: 0.6rem 1.2rem;
    border-radius: 5px;
    cursor: pointer;
    margin: 1rem auto;
    display: block;
    max-width: 300px;
    transition: background-color 0.3s ease, border-color 0.3s ease;
  }
  
  .delete-account-btn:hover {
    background-color: #E27675;
  }
  
  .error {
    color: red;
    text-align: center;
    margin-top: 1rem;
  }

  .modal-wrapper {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 1100;
  }

  .modal-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    border: none;
    cursor: pointer;
  }

  .modal-content {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: #fff;
    padding: 1.5rem 2rem;
    border-radius: 8px;
    z-index: 1110;
    width: 350px;
    max-width: 90%;
  }

  .modal-close-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    background: transparent;
    border: none;
    font-size: 1.2rem;
    cursor: pointer;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .input-group {
    margin-bottom: 1rem;
  }

  .input-group label {
    display: block;
    margin-bottom: 0.5rem;
  }

  .input-group input {
    width: 100%;
    padding: 0.75rem;
    box-sizing: border-box;
  }

  .success {
    color: green;
    text-align: center;
    margin-top: 1rem;
  }
</style>
