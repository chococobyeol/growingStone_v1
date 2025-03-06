<script lang="ts">
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { goto } from '$app/navigation';
  import { t } from 'svelte-i18n';
  import { currentStone } from '$lib/stoneStore';
  import { getStoneImagePath, getDefaultImagePath } from '$lib/imageUtils';

  // DB에서 조회되는 acquired_stones 행의 타입 정의
  interface AcquiredStone {
    id: string;
    user_id: string;
    stone_type: string;
    acquired_count: number;
    created_at: string;
    updated_at: string;
  }

  // acquiredStones 변수에 타입을 명시합니다.
  let acquiredStones: AcquiredStone[] = [];
  let loading = true;
  // 세션에서 가져온 사용자 ID를 저장할 변수
  let userId: string = "";

  // 이미지 로드 에러 처리 함수 추가
  function handleImageError(e: Event) {
    const imgElement = e.target as HTMLImageElement;
    imgElement.src = getDefaultImagePath();
    imgElement.onerror = null; // 무한 루프 방지
  }

  async function loadAcquiredStones() {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error("세션 로드 실패:", sessionError);
      return;
    }
    if (!sessionData?.session?.user) {
      console.error("로그인된 사용자가 없습니다.");
      return;
    }
    userId = sessionData.session.user.id;
    const { data, error } = await supabase
      .from('acquired_stones')
      .select('*')
      .eq('user_id', userId);
    if (error) {
      console.error("도감 데이터 불러오기 실패:", error);
    } else {
      acquiredStones = data;
    }
    loading = false;
  }

  // 상세 정보 모달을 위한 선택된 돌 관리
  let selectedStone: AcquiredStone | null = null;
  function openDetail(stone: AcquiredStone) {
    selectedStone = stone;
  }
  function closeDetail() {
    selectedStone = null;
  }

  // ★ 새로운 기능: 돌 획득 확률 모달 관련 상태 및 함수
  let showProbabilityModal = false;
  let stoneProbabilities: any[] = [];

  async function loadStoneProbabilities() {
    try {
      const response = await fetch('/stoneProbability.csv');
      const csvText = await response.text();
      stoneProbabilities = parseCSV(csvText);
    } catch (err) {
      console.error("CSV 불러오기 실패:", err);
    }
  }

  function openProbabilityModal() {
    loadStoneProbabilities();
    showProbabilityModal = true;
  }

  function closeProbabilityModal() {
    showProbabilityModal = false;
  }

  function parseCSV(text: string) {
    const lines = text.trim().split('\n');
    if (lines.length === 0) return [];
    const headers = lines[0].split(',').map(header => header.trim());
    const data = [];
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',');
      const rowData: any = {};
      headers.forEach((header, index) => {
        rowData[header] = row[index] ? row[index].trim() : '';
      });
      data.push(rowData);
    }
    return data;
  }

  onMount(async () => {
    await loadAcquiredStones();
  });
</script>

<div class="catalog-container">
  <header class="catalog-header">
    <h1>{$t('catalog')}</h1>
  </header>

  <!-- ★ 획득 확률 보기 버튼 (프로필 등과 동일한 .btn 스타일 적용) -->
  <button type="button" class="btn" on:click={openProbabilityModal}>
    {$t('showAcquisitionProbability') || "획득 확률 보기"}
  </button>

  {#if loading}
    <p>{$t('loading')}...</p>
  {:else}
    {#if acquiredStones.length === 0}
      <p>{$t('noStonesAcquired')}</p>
    {:else}
      <div class="stones-grid">
        {#each acquiredStones as stone}
          <button type="button" class="stone-tile" on:click={() => openDetail(stone)}>
            <img 
              src={getStoneImagePath(stone.stone_type)} 
              alt={$t(`stoneTypes.${stone.stone_type}`)} 
              on:error={handleImageError}
            />
            <p class="stone-type {($t(`stoneTypes.${stone.stone_type}`)).length > 10 ? 'small-text' : ''}">
              {$t(`stoneTypes.${stone.stone_type}`)}
            </p>
          </button>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<!-- 돌 상세 정보 모달 -->
{#if selectedStone}
  <div
    class="modal-overlay"
    tabindex="0"
    role="button"
    on:click={closeDetail}
    on:keydown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') closeDetail();
    }}>
    <div class="modal-card" role="presentation" on:click|stopPropagation>
      <button type="button" class="modal-close" on:click={closeDetail}>&times;</button>
      <img 
        src={getStoneImagePath(selectedStone.stone_type)} 
        alt={$t(`stoneTypes.${selectedStone.stone_type}`)} 
        on:error={handleImageError}
      />
      <h2>{$t(`stoneTypes.${selectedStone.stone_type}`)}</h2>
      <p>{$t('acquiredCount')}: {selectedStone.acquired_count}</p>
      <p>{$t('createdAt')}: {new Date(selectedStone.created_at).toLocaleString()}</p>
      <div class="stone-description">
        {$t(`stoneDescriptions.${selectedStone.stone_type}`)}
      </div>
    </div>
  </div>
{/if}

<!-- ★ 돌 획득 확률 모달 영역 -->
{#if showProbabilityModal}
  <div class="modal-overlay" tabindex="0" role="button" on:click={closeProbabilityModal} on:keydown={(e) => { if(e.key === 'Enter' || e.key === ' ') closeProbabilityModal(); }}>
    <div class="modal-card" role="presentation" on:click|stopPropagation>
      <button type="button" class="modal-close" on:click={closeProbabilityModal}>&times;</button>
      <h2>{$t('acquisitionProbability') || "돌 획득 확률"}</h2>
      <div class="probability-table">
        {#if stoneProbabilities.length > 0}
          <table>
            <thead>
              <tr>
                <th>{$t('stoneType') || "종류"}</th>
                <th>{$t('acquisitionProbability') || "획득 확률"}</th>
              </tr>
            </thead>
            <tbody>
              {#each stoneProbabilities as row}
                <tr>
                  <td>{$t(`stoneTypes.${row.Type.toLowerCase()}`) || row.Type}</td>
                  <td>
                    {row.Probability 
                      ? (parseFloat(row.Probability) * 100).toFixed(2) + '%' 
                      : '-'}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {:else}
          <p>{$t('loading')}</p>
        {/if}
      </div>
    </div>
  </div>
{/if}

<button type="button" class="back-btn" on:click={() => goto('/')}>{$t('backButton')}</button>

<style>
  .catalog-container {
    max-width: 800px;
    margin: 0 auto;
    padding: 1rem;
    text-align: center;
    margin-top: 3rem;
  }
  .catalog-header {
    margin-bottom: 1rem;
  }
  h1 {
    margin: 0;
    font-size: 2rem;
  }
  .stones-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(80px, 80px));
    justify-content: start;
    gap: 0.75rem;
    padding: 1rem;
  }
  .stone-tile {
    background-color: #fff;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 0.3rem;
    cursor: pointer;
    transition: transform 0.2s;
    text-align: center;
    font-size: 0.8rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
  .stone-tile:hover {
    transform: scale(1.05);
  }
  .stone-tile img {
    max-width: 80%;
    height: auto;
    margin-bottom: 0;
  }
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
    outline: none;
  }
  .modal-card {
    background: white;
    border-radius: 8px;
    padding: 1.5rem;
    max-width: 400px;
    width: 90%;
    text-align: center;
    position: relative;
    max-height: 80vh;
    overflow-y: auto;
  }
  .modal-card img {
    max-width: 60%;
    height: auto;
    margin-bottom: 0.3rem;
  }
  .modal-close {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    background: transparent;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
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
  .stone-type {
    font-weight: bold;
    margin-top: 0.1rem;
    font-size: 1rem;
    white-space: normal;
    word-wrap: break-word;
  }
  .small-text {
    font-size: 0.7rem;
  }
  .stone-description {
    max-height: 150px;
    overflow-y: auto;
    margin-top: 1rem;
    padding: 0.5rem;
    text-align: left;
    background-color: #f9f9f9;
    box-shadow: inset 0 0 5px rgba(0, 0, 0, 0.1);
    line-height: 1.6;
  }
  .stone-description::first-letter {
    font-size: 1.5em;
    font-weight: bold;
  }
  .modal-card h2 {
    margin-top: -3.0rem;
  }
  .probability-table {
    margin-top: 1rem;
    overflow-x: auto;
  }
  .probability-table table {
    width: 100%;
    border-collapse: collapse;
  }
  .probability-table th, .probability-table td {
    border: 1px solid #ddd;
    padding: 0.5rem;
    text-align: center;
  }
  .probability-table th {
    background-color: #f7f7f7;
    font-weight: bold;
  }
  .btn {
    background-color: #B7DDBF;
    color: #000;
    border: 1px solid #ddd;
    padding: 0.6rem 1.2rem;
    border-radius: 5px;
    cursor: pointer;
    margin: 1rem auto;
    display: block;
    max-width: 300px;
    transition: background-color 0.3s ease, border-color 0.3s ease;
  }
  .btn:hover {
    background-color: #A3CBB1;
  }
</style>
