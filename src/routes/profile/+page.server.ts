import { redirect, fail } from '@sveltejs/kit';
import type { Actions, RequestEvent } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/supabaseAdminClient.server';

/*
  이 코드는 SvelteKit의 Named Actions 사용 예시로, 회원 탈퇴 폼에서
  버튼의 name="deleteAccount"로 전달된 요청을 처리합니다.
*/
export const actions: Actions = {
	deleteAccount: async ({ request, cookies }: RequestEvent) => {
		// 폼 데이터를 가져오기
		const formData = await request.formData();
		const token = formData.get('token');
		if (!token || typeof token !== 'string') {
			return fail(401, { message: '세션 정보가 없습니다.' });
		}
		
		// Supabase Admin 클라이언트를 사용하여 사용자 정보를 조회합니다.
		const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
		if (userError || !user) {
			return fail(401, { message: '로그인이 필요합니다.' });
		}
		const userId = user.id;
		
		try {
			// 1) market_listings 테이블에서 판매자 또는 구매자로 등록된 건 삭제
			const { error: marketError } = await supabaseAdmin
				.from('market_listings')
				.delete()
				.or(`seller_id.eq.${userId},buyer_id.eq.${userId}`);
			if (marketError) throw marketError;
			
			// 2) acquired_stones 테이블 삭제
			const { error: acquiredError } = await supabaseAdmin
				.from('acquired_stones')
				.delete()
				.eq('user_id', userId);
			if (acquiredError) throw acquiredError;
			
			// 3) stones 테이블 삭제
			const { error: stonesError } = await supabaseAdmin
				.from('stones')
				.delete()
				.eq('user_id', userId);
			if (stonesError) throw stonesError;
			
			// 4) profiles 테이블 삭제
			const { error: profileError } = await supabaseAdmin
				.from('profiles')
				.delete()
				.eq('id', userId);
			if (profileError) throw profileError;
			
			// 5) Supabase Auth 사용자 삭제
			const { error: authDeletionError } = await supabaseAdmin.auth.admin.deleteUser(userId);
			if (authDeletionError) throw authDeletionError;
			
			// 6) 쿠키 삭제 및 리다이렉트
			cookies.delete('session', { path: '/' });
			
			throw redirect(302, '/login');
		} catch (error: any) {
			console.error('회원 탈퇴 중 에러 발생:', error);
			return fail(500, { message: error.message || '회원 탈퇴 처리 중 오류가 발생했습니다.' });
		}
	}
};
