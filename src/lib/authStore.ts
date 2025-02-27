import { writable } from 'svelte/store';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '$lib/supabaseClient';

// writable에 제네릭을 명시하여 Session | null 타입임을 명시
const session = writable<Session | null>(null);

async function initializeSession() {
	const {
		data: { session: currentSession }
	} = await supabase.auth.getSession();
	session.set(currentSession);
}

// 앱이 시작할 때 초기 세션을 확인
initializeSession();

// 인증 상태 변경 구독
supabase.auth.onAuthStateChange((event, sessionData) => {
	session.set(sessionData);
});

export { session };