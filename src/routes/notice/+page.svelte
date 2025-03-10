<script lang="ts">
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { marked } from 'marked';
  import { goto } from '$app/navigation';
  import { t } from 'svelte-i18n';

  // 공지사항 데이터 타입 정의
  interface Notice {
    id: string;
    title: string;
    content: string;
    created_at: string;
    is_published: boolean;
  }

  let notices: Notice[] = [];
  let errorMsg = '';

  onMount(async () => {
    const { data, error } = await supabase
      .from('notice')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('공지사항 불러오기 실패:', error);
      errorMsg = error.message;
    } else if (data) {
      notices = data;
    }
  });
</script>

<svelte:head>
  <title>{$t('notice')}</title>
</svelte:head>

<div class="notice-container">
  <h1>{$t('notice')}</h1>
  {#if errorMsg}
    <p class="error">{errorMsg}</p>
  {:else if notices.length === 0}
    <p>{$t('noNotices')}</p>
  {:else}
    {#each notices as notice}
      <div class="notice-card">
        <h2>{notice.title}</h2>
        <div class="content">
          {@html marked(notice.content)}
        </div>
        <small>{new Date(notice.created_at).toLocaleString()}</small>
      </div>
    {/each}
  {/if}
</div>

<!-- 백버튼 -->
<button class="back-btn" on:click={() => goto('/')}>{$t('backButton')}</button>

<!-- 프라이버시 폴리시 푸터 -->
<div class="help-footer">
  <a href="/privacy-policy">{$t('privacyPolicy')}</a>
</div>

<style>
  .notice-container {
    max-width: 600px;
    margin: 2rem auto;
    padding: 1rem;
    text-align: left;
  }
  .notice-container h1 {
    font-size: 2rem;
    margin-bottom: 1rem;
    text-align: center;
  }
  /* 보관함 카드와 유사한 스타일 적용 */
  .notice-card {
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
  .notice-card h2 {
    margin: 0;
    font-size: 1.5rem;
  }
  .notice-card .content {
    margin: 0.5rem 0;
    font-size: 1rem;
  }
  .notice-card small {
    color: #666;
  }
  .error {
    color: red;
    text-align: center;
  }
  /* help 페이지에서 사용하는 백버튼 스타일 */
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
    margin: 0;
    cursor: pointer;
  }
  /* help 페이지의 프라이버시 폴리시 푸터 스타일 */
  .help-footer {
    position: fixed;
    bottom: 0;
    left: 0;
    width: 100%;
    background: #fff;
    padding: 1rem 0;
    text-align: center;
    z-index: 900;
  }
  .help-footer a {
    text-decoration: none;
    color: #000;
    cursor: pointer;
  }
</style>
