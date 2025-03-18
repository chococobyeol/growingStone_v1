<script lang="ts">
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { loadUserXpData, userXpData } from '$lib/xpUtils';
  import { t, locale } from 'svelte-i18n';
  import { get } from 'svelte/store';
  // 메인 탭: 'user' (유저 랭킹), 'stone' (돌 랭킹)
  let activeMainTab: 'user' | 'stone' = 'user';
  // 돌 랭킹 하위 탭: 'integrated' (전체 돌 랭킹), 'byType' (돌 타입별)
  let activeStoneTab: 'integrated' | 'byType' = 'integrated';
  let selectedStoneType = '전체';

  // 유저 랭킹 데이터 타입
  type UserProfile = {
    nickname: string;
    xp: number;
    level: number;
    progress: number;
  };
  let userRanking: UserProfile[] = [];

  // 돌 랭킹 데이터 타입 (돌 타입을 포함)
  type Stone = {
    name: string;
    size: number;
    type: string;
  };
  let stoneRankingIntegrated: Stone[] = [];
  let stoneRankingByType: Stone[] = [];
  let stoneTypes: string[] = [];

  // 누적 경험치 데이터(userXpData)를 기반으로 레벨 및 진행도를 계산하는 함수
  function calculateUserLevel(xp: number): { level: number; progress: number } {
    if (!userXpData || userXpData.length === 0) {
      return { level: 1, progress: 0 };
    }
    const sortedData = [...userXpData].sort((a, b) => a.level - b.level);
    let calculatedLevel = sortedData[0].level;
    let baseXp = 0;
    let requiredXp = sortedData[0].cumulativeXp;
    let progress = 0;
    for (let i = 0; i < sortedData.length; i++) {
      if (i > 0) {
        baseXp = sortedData[i - 1].cumulativeXp;
      }
      if (xp < sortedData[i].cumulativeXp) {
        calculatedLevel = sortedData[i].level;
        requiredXp = sortedData[i].cumulativeXp - baseXp;
        progress = ((xp - baseXp) / requiredXp) * 100;
        return { level: calculatedLevel, progress: Math.floor(progress) };
      }
      if (i === sortedData.length - 1) {
        calculatedLevel = sortedData[i].level;
        requiredXp = sortedData[i].cumulativeXp - baseXp;
        progress = ((xp - baseXp) / requiredXp) * 100;
      }
    }
    return { level: calculatedLevel, progress: Math.floor(progress) };
  }

  async function loadUserRanking() {
    await loadUserXpData();
    const { data, error } = await supabase
      .from('profiles')
      .select('nickname, xp')
      .gt('xp', 1)
      .order('xp', { ascending: false })
      .limit(10);
    if (error) {
      console.error("유저 랭킹 데이터를 불러오는 데 실패했습니다:", error);
      return;
    }
    if (data) {
      userRanking = data.map((profile: any) => {
        const { level, progress } = calculateUserLevel(profile.xp);
        return { nickname: profile.nickname, xp: profile.xp, level, progress };
      });
    }
  }

  async function loadStoneRankingIntegrated() {
    const { data, error } = await supabase
      .from('stones')
      .select('name, size, type')
      .gt('size', 1)
      .order('size', { ascending: false })
      .limit(10);
    if (error) {
      console.error("전체 돌 랭킹 데이터를 불러오는 데 실패했습니다:", error);
      return;
    }
    if (data) {
      stoneRankingIntegrated = data;
    }
  }

  async function loadStoneTypes() {
    const { data, error } = await supabase
      .from('stones')
      .select('type');
    if (error) {
      console.error("돌 타입 데이터를 불러오는 데 실패했습니다:", error);
      return;
    }
    if (data) {
      const typesSet = new Set(data.map((stone: any) => stone.type));
      stoneTypes = Array.from(typesSet);
      // 현재 언어 설정에 따라 정렬: 번역된 문자열 기준 정렬
      const currentLocale = get(locale);
      const translate = get(t);
      stoneTypes.sort((a, b) =>
        translate(`stoneTypes.${a}`).localeCompare(
          translate(`stoneTypes.${b}`),
          currentLocale === 'ko' ? 'ko' : 'en',
          { sensitivity: 'base' }
        )
      );
    }
  }

  async function loadStoneRankingByType(type: string) {
    const { data, error } = await supabase
      .from('stones')
      .select('name, size, type')
      .eq('type', type)
      .gt('size', 1)
      .order('size', { ascending: false })
      .limit(10);
    if (error) {
      console.error(`돌 랭킹 (타입: ${type}) 데이터를 불러오는 데 실패했습니다:`, error);
      return;
    }
    if (data) {
      stoneRankingByType = data;
    }
  }

  onMount(() => {
    if (activeMainTab === 'user') {
      loadUserRanking();
    }
    if (activeMainTab === 'stone') {
      if (activeStoneTab === 'integrated') {
        loadStoneRankingIntegrated();
      } else {
        loadStoneTypes().then(() => {
          if (stoneTypes.length > 0) {
            selectedStoneType = stoneTypes[0];
            loadStoneRankingByType(selectedStoneType);
          }
        });
      }
    }
  });

  // 메인 탭 전환 시 데이터 재로딩
  function switchMainTab(tab: 'user' | 'stone') {
    activeMainTab = tab;
    if (tab === 'user') {
      loadUserRanking();
    } else if (tab === 'stone') {
      if (activeStoneTab === 'integrated') {
        loadStoneRankingIntegrated();
      } else {
        loadStoneTypes().then(() => {
          if (stoneTypes.length > 0) {
            selectedStoneType = stoneTypes[0];
            loadStoneRankingByType(selectedStoneType);
          }
        });
      }
    }
  }

  // 돌 랭킹 하위 탭(전체/타입별) 전환 시 데이터 재로딩
  function switchStoneTab(tab: 'integrated' | 'byType') {
    activeStoneTab = tab;
    if (tab === 'integrated') {
      loadStoneRankingIntegrated();
    } else {
      loadStoneTypes().then(() => {
        if (stoneTypes.length > 0) {
          selectedStoneType = stoneTypes[0];
          loadStoneRankingByType(selectedStoneType);
        }
      });
    }
  }

  function onStoneTypeChange(event: Event) {
    const selectElem = event.target as HTMLSelectElement;
    selectedStoneType = selectElem.value;
    loadStoneRankingByType(selectedStoneType);
  }

  function goBack() {
    history.back();
  }
</script>

<svelte:head>
  <title>{$t('ranking.pageTitle')}</title>
</svelte:head>

<div class="ranking-container">
  <h1 class="page-title">{$t('ranking.pageTitle')}</h1>
  <div class="tab-switcher">
    <button class="tab-button {activeMainTab === 'user' ? 'active' : ''}" on:click={() => switchMainTab('user')}>
      {$t('ranking.userRankingTab')}
    </button>
    <button class="tab-button {activeMainTab === 'stone' ? 'active' : ''}" on:click={() => switchMainTab('stone')}>
      {$t('ranking.stoneRankingTab')}
    </button>
  </div>
  
  {#if activeMainTab === 'user'}
    <h2 class="section-title">{$t('ranking.userRankingTitle')}</h2>
    <table class="data-table">
      <thead>
        <tr>
          <th>{$t('ranking.position')}</th>
          <th>{$t('ranking.nickname')}</th>
          <th>{$t('ranking.levelProgress')}</th>
        </tr>
      </thead>
      <tbody>
        {#each userRanking as user, index}
          <tr>
            <td>{index + 1}</td>
            <td>{user.nickname}</td>
            <td>Lv. {user.level} ({user.progress}%)</td>
          </tr>
        {/each}
      </tbody>
    </table>
  
  {:else if activeMainTab === 'stone'}
    <h2 class="section-title">{$t('ranking.stoneRankingTitle')}</h2>
    <div class="sub-tab-switcher">
      <button class="tab-button {activeStoneTab === 'integrated' ? 'active' : ''}" on:click={() => switchStoneTab('integrated')}>
        {$t('ranking.integratedStoneRanking')}
      </button>
      <button class="tab-button {activeStoneTab === 'byType' ? 'active' : ''}" on:click={() => switchStoneTab('byType')}>
        {$t('ranking.stoneRankingByType')}
      </button>
    </div>
    {#if activeStoneTab === 'integrated'}
      <table class="data-table">
        <thead>
          <tr>
            <th>{$t('ranking.position')}</th>
            <th>{$t('ranking.stoneName')}</th>
            <th>{$t('ranking.stoneType')}</th>
            <th>{$t('ranking.stoneSize')}</th>
          </tr>
        </thead>
        <tbody>
          {#each stoneRankingIntegrated as stone, index}
            <tr>
              <td>{index + 1}</td>
              <td>{stone.name}</td>
              <td>{$t(`stoneTypes.${stone.type}`)}</td>
              <td>{stone.size.toFixed(4)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <div class="select-container">
        <label for="stoneType">{$t('ranking.selectStoneType')}</label>
        <select id="stoneType" bind:value={selectedStoneType} on:change={onStoneTypeChange}>
          {#each stoneTypes as type}
            <option value={type}>{$t(`stoneTypes.${type}`)}</option>
          {/each}
        </select>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>{$t('ranking.position')}</th>
            <th>{$t('ranking.stoneName')}</th>
            <th>{$t('ranking.stoneType')}</th>
            <th>{$t('ranking.stoneSize')}</th>
          </tr>
        </thead>
        <tbody>
          {#each stoneRankingByType as stone, index}
            <tr>
              <td>{index + 1}</td>
              <td>{stone.name}</td>
              <td>{$t(`stoneTypes.${stone.type}`)}</td>
              <td>{stone.size.toFixed(4)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  {/if}
</div>

<button class="back-btn" on:click={goBack}>{$t('backButton')}</button>

<style>
  /* 컨테이너는 다른 페이지와 통일감을 주도록 유지 */
  .ranking-container {
    max-width: 600px;
    margin: 2rem auto;
    padding: 1rem;
  }

  /* 제목 스타일: h1은 그대로, h2(.section-title)의 폰트 크기를 1.5rem으로 변경 */
  .page-title {
    text-align: center;
    margin-bottom: 1rem;
  }

  .section-title {
    text-align: center;
    margin: 1rem 0;
    font-size: 1.5rem; /* 기존보다 크게 하여 통일감 확보 */
    font-weight: bold;
  }

  /* 탭 스위치 스타일 조정 */
  .tab-switcher {
    display: flex;
    justify-content: center;
    margin-bottom: 1rem;
  }

  .tab-button {
    padding: 0.5rem 1.5rem;
    background-color: #f0f0f0;
    border: 1px solid #ddd;
    cursor: pointer;
    transition: background-color 0.3s;
    font-weight: normal;
  }

  .tab-button.active {
    background-color: #B7DDBF;
    font-weight: bold;
  }

  /* 첫번째, 마지막 탭에 라운드 처리 추가 */
  .tab-button:first-child {
    border-top-left-radius: 4px;
    border-bottom-left-radius: 4px;
  }

  .tab-button:last-child {
    border-top-right-radius: 4px;
    border-bottom-right-radius: 4px;
  }

  .sub-tab-switcher {
    display: flex;
    justify-content: center;
    margin-bottom: 1rem;
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 1.5rem;
  }

  .data-table th,
  .data-table td {
    text-align: left;
    padding: 0.75rem;
    border-bottom: 1px solid #e0e0e0;
  }

  .select-container {
    text-align: center;
    margin-bottom: 1rem;
  }

  .select-container label {
    margin-right: 0.5rem;
    font-weight: bold;
  }

  .select-container select {
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    outline: none;
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
    cursor: pointer;
  }
</style>
