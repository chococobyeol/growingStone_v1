<script lang="ts">
  import { goto } from '$app/navigation';
  import { setLanguage } from '$lib/i18n';
  import { t } from 'svelte-i18n';
  import { showDeleteWarning } from '$lib/settingsStore';
</script>

<div class="settings-container">
  <h1>{$t('settings')}</h1>
  <p>{$t('settingsDescription')}</p>
  <div class="language-settings">
    <h2>{$t('languageSettings')}</h2>
    <div class="language-buttons">
      <button class="btn" on:click={() => setLanguage('en')}>English</button>
      <button class="btn" on:click={() => setLanguage('ko')}>한국어</button>
    </div>
  </div>

  <div class="delete-warning-settings">
    <h2>{$t('deleteWarningSetting')}</h2>
    <label>
      <input type="checkbox" bind:checked={$showDeleteWarning} />
      {$t('enableDeleteWarning')}
    </label>
  </div>
</div>

<!-- 뒤로 버튼을 보관함과 동일한 위치에 고정 -->
<button class="back-btn" on:click={() => goto('/')}>{$t('backButton')}</button>

<style>
  .settings-container {
    max-width: 600px;
    margin: 2rem auto;
    padding: 1rem;
    text-align: center;
  }
  .language-settings,
  .delete-warning-settings {
    margin: 1rem 0;
  }

  /* 언어 버튼 및 기타 버튼 스타일 (보관함과 동일한 스타일 적용) */
  .btn {
    padding: 0.5rem 1rem;
    color: #000;
    background-color: #B7DDBF;
    border: 1px solid #DDDDDD;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.3s;
    margin: 0.5rem;
  }
  .btn:hover {
    background-color: #A3CBB1;
  }

  /* 뒤로 버튼 스타일 */
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

  /* 언어 버튼 그룹 스타일 */
  .language-buttons {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
  }

  .language-buttons .btn {
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 40px;
    box-sizing: border-box;
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
  }
</style>
