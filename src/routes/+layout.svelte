<script lang="ts">
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
  
	let localeReady = false;
	waitLocale().then(() => {
	  localeReady = true;
	});
  
	let user: User | null = null;
	let logoutTriggered = false; // 로그아웃이 이미 실행되었는지 여부
  
	// store 구독을 통해 로그인 상태를 받아옴
	const unsubscribe = session.subscribe((currentSession) => {
	  user = currentSession ? currentSession.user : null;
	  // 세션이 사라지면 플래그 초기화
	  if (!currentSession) {
		logoutTriggered = false;
	  }
	});
  
	onDestroy(() => {
	  unsubscribe();
	});
  
	const authRoutes = ['/login', '/register'];
  
	async function logout() {
	  const { data: sessionData } = await supabase.auth.getSession();
	  if (!sessionData?.session) {
		session.set(null);
		localStorage.removeItem('activeSession');
		goto('/');
		return;
	  }
	  if (activeSessionSubscription) {
		supabase.removeChannel(activeSessionSubscription);
	  }
	  const { error } = await supabase.auth.signOut();
	  if (error) {
		// 'Auth session missing!' 오류는 이미 세션이 없는 것으로 판단하여 무시
		if (error.message === 'Auth session missing!') {
		  console.warn("세션이 이미 만료되어 강제 로그아웃 처리합니다.");
		} else {
		  console.error("로그아웃 실패:", error.message);
		  return;
		}
	  }
	  // 클라이언트 상태 초기화 (세션, localStorage 등)
	  session.set(null);
	  localStorage.removeItem('activeSession');
	  goto('/');
	}
  
	// activeSessionSubscription 변수의 타입을 명시합니다.
	let activeSessionSubscription: RealtimeChannel | null = null;
  
	// 실시간 구독: active_session 값이 변경되면 체크
	$: if (user) {
	  const userId = user.id;
	  activeSessionSubscription = supabase
		.channel('active-session')
		.on(
		  'postgres_changes',
		  {
			event: 'UPDATE',
			schema: 'public',
			table: 'profiles',
			filter: `id=eq.${userId}`
		  },
		  (payload: any) => {
			const newActiveSession = payload.new.active_session;
			const localActiveSession = localStorage.getItem('activeSession');
			// primary 탭이 아닌 경우(localActiveSession와 다르면)
			if (localActiveSession && newActiveSession && localActiveSession !== newActiveSession && !logoutTriggered) {
			  logoutTriggered = true;
			  alert("다른 기기에서 로그인되었습니다. 현재 기기는 로그아웃됩니다.");
			  logout();
			}
		  }
		)
		.subscribe();
	} else {
	  // user가 없을 때 기존 구독 해제
	  if (activeSessionSubscription) {
		supabase.removeChannel(activeSessionSubscription);
	  }
	}
  
	onDestroy(() => {
	  if (activeSessionSubscription) {
		supabase.removeChannel(activeSessionSubscription);
	  }
	});

	// active_session 업데이트 함수 추가
	async function updateActiveSession() {
	  const { data: sessionData, error } = await supabase.auth.getSession();
	  if (error) {
		console.error('세션 로드 실패:', error.message);
		return;
	  }
	  if (sessionData?.session && get(isPrimary)) {
		const activeSession = myId;
		localStorage.setItem('activeSession', activeSession);
		const { error: updateError } = await supabase
		  .from('profiles')
		  .update({ active_session: activeSession })
		  .eq('id', sessionData.session.user.id);
		if (updateError) {
		  console.error("active_session 업데이트 실패:", updateError.message);
		}
	  }
	}
  
	// 페이지 로드시 및 일정 주기로 active_session을 업데이트합니다.
	onMount(() => {
	  updateActiveSession();
	  
	  // 기존의 폴링 및 구독 로직 (하나만 유지)
	  const interval = setInterval(async () => {
		if (user && get(isPrimary)) {
		  const { data: sessionData } = await supabase.auth.getSession();
		  if (!sessionData?.session?.user) return;
		  const userId = sessionData.session.user.id;
		  const { data: profileData, error } = await supabase
			.from('profiles')
			.select('active_session')
			.eq('id', userId)
			.single();
		  if (error) {
			console.error("프로필의 active_session 로드 실패:", error.message);
			return;
		  }
		  const newActiveSession = profileData.active_session;
		  const localActiveSession = localStorage.getItem('activeSession');
		  if (localActiveSession && newActiveSession && localActiveSession !== newActiveSession && !logoutTriggered) {
			logoutTriggered = true;
			alert("다른 기기에서 로그인되었습니다. 현재 기기는 로그아웃됩니다.");
			logout();
		  }
		}
	  }, 5000);
  
	  return () => {
		clearInterval(interval);
	  };
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