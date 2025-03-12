import { writable } from 'svelte/store';

// 더 이상 active_session 기반 tab claim 기능이 필요 없으므로,
// isPrimary는 무조건 true로 설정합니다.
export const isPrimary = writable(true);

// myId는 사용하지 않으므로 빈 문자열 또는 null로 처리합니다.
export const myId = '';
