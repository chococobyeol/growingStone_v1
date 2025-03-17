<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { t } from "svelte-i18n";

  let buttonEl: HTMLDivElement;

  onMount(() => {
    const container = document.getElementById("fixed-controls");
    if (container && buttonEl) {
      container.appendChild(buttonEl);
    }
  });

  function handleClick() {
    goto("/");
  }
</script>

<div bind:this={buttonEl} class="fixed-btn-wrapper">
  <button class="back-btn" on:click={handleClick}>
    {$t('backButton')}
  </button>
</div>

<style>
  .fixed-btn-wrapper {
    position: fixed;
    bottom: 20px;
    left: 20px;
    z-index: 10000;
  }
  .back-btn {
    background: #D7D4CD;
    color: #000;
    padding: 0.5rem 1rem;
    border: 1px solid #DDDDDD;
    border-radius: 4px;
    cursor: pointer;
  }
</style>
