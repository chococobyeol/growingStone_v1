<script lang="ts">
  import { goto } from '$app/navigation';
  import { t } from 'svelte-i18n';
</script>

<div class="help-container">
  <h1>{$t('help')}</h1>
  <p>{$t('helpDescription')}</p>
  <h2>{$t('menuExplanationTitle')}</h2>
  <ul>
    <li><strong>{$t('storage')}:</strong> {$t('helpMenuStorage')}</li>
    <li><strong>{$t('profile')}:</strong> {$t('helpMenuProfile')}</li>
    <li><strong>{$t('catalog')}:</strong> {$t('helpMenuCatalog')}</li>
    <li><strong>{$t('market')}:</strong> {$t('helpMenuMarket')}</li>
    <li><strong>{$t('settings')}:</strong> {$t('helpMenuSettings')}</li>
  </ul>
  <p>{$t('helpStoneNameHint')}</p>
</div>

<!-- 보관함, 설정창과 동일한 스타일의 뒤로가기 버튼 -->
<button class="back-btn" on:click={() => goto('/')}>{$t('backButton')}</button>

<footer class="help-footer">
  <a href="/privacy-policy">
    {$t('privacyPolicy')}
  </a>
</footer>

<style>
  .help-container {
    max-width: 600px;
    margin: 2rem auto;
    padding: 1rem;
    text-align: left;
  }
  
  h1 {
    font-size: 2rem;
    margin-bottom: 1rem;
    text-align: center;
  }
  
  h2 {
    font-size: 1.5rem;
    margin: 1rem 0;
  }
  
  p {
    font-size: 1.1rem;
    margin: 0.5rem 0;
  }
  
  ul {
    list-style-type: disc;
    padding-left: 1.5rem;
    margin: 1rem 0;
  }
  
  li {
    margin-bottom: 0.5rem;
    font-size: 1.1rem;
  }
  
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
