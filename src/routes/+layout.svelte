<!-- 파일 경로: src/routes/+layout.svelte, 파일명: +layout.svelte -->
<script lang="ts">
	import '../app.css';
	import { waitLocale } from 'svelte-i18n';
	import { session } from '$lib/authStore';
	import { supabase } from '$lib/supabaseClient';
	import type { User, RealtimeChannel } from '@supabase/supabase-js';
	import { onDestroy, onMount } from 'svelte';
	import { page } from '$app/stores';
	import '../lib/i18n';
	import { t } from 'svelte-i18n';
	import { setLanguage } from '$lib/i18n';
	import { goto } from '$app/navigation';
	import { isPrimary, myId } from '$lib/activeSessionManager';
	import { get } from 'svelte/store';
	import { sendActiveSessionUpdate } from '$lib/websocketClient';
  
	let localeReady = false;
	waitLocale().then(() => {
	  localeReady = true;
	});
  
	let user: User | null = null;
  
	// store 구독을 통해 로그인 상태를 받아옴
	const unsubscribe = session.subscribe((currentSession) => {
	  user = currentSession ? currentSession.user : null;
	});
  
	onDestroy(() => {
	  unsubscribe();
	});
  
	const authRoutes = ['/login', '/register'];
  
	// browserId 변수만 선언 (클라이언트에서 초기화)
	let browserId: string = "";
  
	async function logout() {
	  console.log("forceLogout 이벤트에 의해 logout() 호출됨");
	  const { error } = await supabase.auth.signOut();
	  if (error && error.message !== 'Auth session missing!') {
		console.error("로그아웃 실패:", error.message);
		return;
	  }
	  session.set(null);
	  localStorage.removeItem('activeSession');
	  goto('/');
	  // location.reload(); // 필요한 경우 강제 새로고침
	}
  
	// 페이지 로드시 및 일정 주기로 active_session을 업데이트합니다.
	onMount(() => {
	  // 클라이언트 전용: browserId 초기화
	  if (typeof localStorage !== 'undefined') {
	    const stored = localStorage.getItem('browserId');
	    if (stored) {
	      browserId = stored;
	    } else {
	      browserId = crypto.randomUUID();
	      localStorage.setItem('browserId', browserId);
	    }
	  }
	});

	// 기존에는 탭이 다시 활성화될 때 logout()을 호출했으나,
	// 이제는 콘솔 로그 정도의 동작만 하여 세션이 유지되도록 합니다.
	onMount(() => {
	  const handleVisibilityChange = () => {
		if (document.visibilityState === 'visible') {
		  // logout() 호출이 제거되었습니다.
		  console.log('탭이 다시 활성화되었습니다. 세션은 그대로 유지됩니다.');
		  // 필요한 경우, session refresh나 기타 동기화 로직을 추가할 수 있습니다.
		}
	  };
	  document.addEventListener('visibilitychange', handleVisibilityChange);
	  return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
	});

	// BroadcastChannel을 이용한 탭 내 라우트 동기화 추가
	onMount(() => {
	  const bc = new BroadcastChannel('tab-navigation');
	  let updateFromBroadcast = false;

	  const unsubscribePage = page.subscribe(($page) => {
	    // Broadcast를 통해 갱신된 것이 아니라면 현재 경로를 전파
	    if (!updateFromBroadcast) {
	      bc.postMessage($page.url.pathname);
	    }
	    updateFromBroadcast = false;
	  });

	  bc.onmessage = (event) => {
	    const newPath = event.data;
	    // 수신한 경로와 현재 경로가 다르면 라우트 변경
	    if (newPath && newPath !== window.location.pathname) {
	      updateFromBroadcast = true;
	      goto(newPath);
	    }
	  };

	  return () => {
	    unsubscribePage();
	    bc.close();
	  };
	});

	// forceLogout 이벤트 처리: 다른 기기에서 로그인 시 이 이벤트가 발생합니다.
	onMount(() => {
	  const handleForceLogout = (event: Event) => {
		const customEvent = event as CustomEvent;
		console.log("forceLogout 메시지 수신:", customEvent.detail);
		// 로그인 상태가 아니라면 forceLogout 이벤트 처리 무시
		if (!user) {
		  console.log("로그인 상태가 아니므로 forceLogout 이벤트를 무시합니다.");
		  return;
		}
		alert("다른 기기에서 로그인되어 로그아웃됩니다.");
		logout();
	  };

	  // 현재 경로가 로그인, 회원가입 페이지인 경우 이벤트 리스너 등록하지 않음
	  if (!['/login', '/register'].includes(window.location.pathname)) {
		window.addEventListener("forceLogout", handleForceLogout);
	  }
	  return () => window.removeEventListener("forceLogout", handleForceLogout);
	});

	// 기존 onMount 블록 대신, user 값이 업데이트될 때 activeSession 업데이트를 실행
	$: if (user && typeof localStorage !== 'undefined' && $isPrimary) {
	  // activeSession이 없으면 browserId를 사용하거나 새 UUID로 초기화
	  let activeSession = localStorage.getItem('activeSession');
	  if (!activeSession) {
		activeSession = browserId || crypto.randomUUID();
		localStorage.setItem('activeSession', activeSession);
		console.log("activeSession 초기화:", activeSession);
	  }
	  console.log("전송 전 로그: activeSession 존재", { userId: user.id, activeSession });
	  sendActiveSessionUpdate({ userId: user.id, activeSession });
	  console.log("WS activeSession 업데이트 전송:", user.id, activeSession);
	} else {
	  console.log("로그인 상태가 아니거나, localStorage를 사용할 수 없습니다.");
	}
</script>

{#if localeReady}
  <!-- 번역 리소스가 로드된 경우에만 화면 표시 -->
  {#if user || authRoutes.includes($page.url.pathname)}
    <!-- 로그인 상태이거나 인증 전용 페이지 방문 시: 해당 페이지 내용을 렌더링 -->
    <slot />
  {:else}
    <!-- 이외의 경우(예, 루트 경로("/")에 접근 시 user가 없으면) -->
    <div class="landing-page">
      <div class="landing-card">
        <h1 class="landing-title">
          <img src="/assets/icons/growstoneicon.png" alt="돌 키우기 아이콘" class="landing-icon" />
          <span>{$t('landingTitle')}</span>
        </h1>
        <p>{$t('landingDescription')}</p>
        <div class="landing-buttons">
          <a class="btn" href="/login">{$t('login')}</a>
          <a class="btn" href="/register">{$t('register')}</a>
        </div>
        <div class="language-settings">
          <span>{$t('languageSettingsTitle')}</span>
          <button class="btn" on:click={() => setLanguage('ko')}>{$t('korean')}</button>
          <button class="btn" on:click={() => setLanguage('en')}>{$t('english')}</button>
        </div>
      </div>
    </div>
  {/if}
{:else}
  <!-- 번역이 아직 로딩 중일 때 간단한 로딩 메시지 표시 -->
  <div>번역 로딩중...</div>
{/if}

<style>
  .landing-page {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: #f9f9f9;
  }
  .landing-card {
    max-width: 400px;
    width: 90%;
    background: #fff;
    padding: 2rem;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    text-align: center;
  }
  .landing-title {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2rem;
    margin-bottom: 1rem;
  }
 /* 타이틀 텍스트 오른쪽 여백 조정 */
  .landing-title span {
    margin-right: 3.8rem;
  }
  .landing-icon {
    width: 60px;
    height: 60px;
    margin-right: 1rem;
    vertical-align: middle;
  }
  .landing-card p {
    margin-bottom: 1.5rem;
    font-size: 1.1rem;
  }
  .landing-buttons {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .landing-buttons .btn {
    padding: 0.5rem 1rem;
    border: 1px solid #dddddd;
    background-color: #b7ddbf;
    color: #000;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.3s;
    margin: 0.5rem;
    font-size: 1rem;
    text-decoration: none;
    display: inline-block;
  }
  .landing-buttons .btn:hover {
    background-color: #a3cbb1;
  }
  .language-settings {
    margin-top: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }
  .language-settings span {
    font-size: 1rem;
    font-weight: bold;
  }
  .language-settings .btn {
    padding: 0.5rem 1rem;
    border: 1px solid #dddddd;
    background-color: #b7ddbf;
    color: #000;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.3s;
    margin: 0;
    font-size: 1rem;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .language-settings .btn:hover {
    background-color: #a3cbb1;
  }
</style>

<svelte:head>
  <title>Growing Stone</title>
</svelte:head>