import { writable } from 'svelte/store';

export const showDeleteWarning = writable<boolean>(true);

// localStorage에 설정을 저장하고, 초기값을 불러옵니다.
if (typeof localStorage !== 'undefined') {
  const storedValue = localStorage.getItem('showDeleteWarning');
  if (storedValue !== null) {
    showDeleteWarning.set(storedValue === 'true');
  }
  showDeleteWarning.subscribe((value) => {
    localStorage.setItem('showDeleteWarning', String(value));
  });
}
