<script lang="ts">
  import { goto } from '$app/navigation';
  import { t } from 'svelte-i18n';
</script>

<div class="policy-container">
  <h1>{$t('privacyPolicy')}</h1>
  
  <section>
    <h2>{$t('privacySection1Title')}</h2>
    <p>{$t('privacySection1Content')}</p>
    <ul>
      <li>{$t('privacySection1ListItem1')}</li>
      <li>{$t('privacySection1ListItem2')}</li>
      <li>{$t('privacySection1ListItem3')}</li>
    </ul>
  </section>
  
  <section>
    <h2>{$t('privacySection2Title')}</h2>
    <p>{$t('privacySection2Content1')}</p>
    <ul>
      <li>{$t('privacySection2ListItem1')}</li>
    </ul>
    <p>{$t('privacySection2Content2')}</p>
    <ul>
      <li>{$t('privacySection2ListItem2')}</li>
      <li>{$t('privacySection2ListItem3')}</li>
      <li>{$t('privacySection2ListItem4')}</li>
    </ul>
  </section>
  
  <section>
    <h2>{$t('privacySection3Title')}</h2>
    <ul>
      <li>{$t('privacySection3ListItem1')}</li>
    </ul>
    <p>{$t('privacySection3Content')}</p>
  </section>
  
  <section>
    <h2>{$t('privacySection4Title')}</h2>
    <p>{$t('privacySection4Content')}</p>
  </section>
  
  <section>
    <h2>{$t('privacySection5Title')}</h2>
    <p>{$t('privacySection5Content')}</p>
    <ul>
      <li>{$t('privacySection5ListItem1')}</li>
      <li>{$t('privacySection5ListItem2')}</li>
      <li>{$t('privacySection5ListItem3')}</li>
      <li>{$t('privacySection5ListItem4')}</li>
    </ul>
    <p>{$t('privacySection5Content2')}</p>
  </section>
  
  <section>
    <h2>{$t('privacySection6Title')}</h2>
    <p>{$t('privacySection6Name')}</p>
    <p>{$t('privacySection6Email')}</p>
  </section>
  
  <section>
    <p>{$t('privacySection7Content')}</p>
  </section>
</div>

<button class="back-btn" on:click={() => goto('/')}>{$t('backButton')}</button>

<style>
  .policy-container {
    max-width: 800px;
    margin: 2rem auto;
    padding: 1rem;
    text-align: left;
  }
  
  h1 {
    font-size: 2rem;
    margin-bottom: 1.5rem;
    text-align: center;
  }
  
  h2 {
    font-size: 1.5rem;
    margin-top: 1.5rem;
    margin-bottom: 0.5rem;
  }
  
  p {
    font-size: 1.1rem;
    line-height: 1.6;
    margin-bottom: 1rem;
  }
  
  ul {
    margin-left: 1.5rem;
    margin-bottom: 1rem;
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
    z-index: 1100;
    cursor: pointer;
  }
</style>
