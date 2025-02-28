import { createClient } from '@supabase/supabase-js';

// // 디버깅을 위한 환경 변수 출력
// console.log('SUPABASE URL:', import.meta.env.VITE_SUPABASE_URL);
// console.log('SUPABASE KEY:', import.meta.env.VITE_SUPABASE_ANON_KEY);

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true
  },
  global: {
    headers: {
      apikey: supabaseAnonKey
    }
  }
});
