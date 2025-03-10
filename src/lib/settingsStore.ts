import { writable } from 'svelte/store';

export const showDeleteWarning = writable<boolean>(true);
export const defaultSortOption = writable<'default' | 'name' | 'sizeAsc' | 'sizeDesc' | 'type'>('default');

// localStorage에 설정을 저장하고, 초기값을 불러옵니다.
if (typeof localStorage !== 'undefined') {
  const storedWarning = localStorage.getItem('showDeleteWarning');
  if (storedWarning !== null) {
    showDeleteWarning.set(storedWarning === 'true');
  }
  showDeleteWarning.subscribe((value) => {
    localStorage.setItem('showDeleteWarning', String(value));
  });

  const storedSortOption = localStorage.getItem('defaultSortOption');
  if (storedSortOption !== null) {
    defaultSortOption.set(storedSortOption as 'default' | 'name' | 'sizeAsc' | 'sizeDesc' | 'type');
  }
  defaultSortOption.subscribe((value) => {
    localStorage.setItem('defaultSortOption', value);
  });
}
