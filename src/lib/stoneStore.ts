import { writable } from 'svelte/store';

export type StoneType = {
  id: string;
  type: string;
  baseSize: number;
  name: string;
  totalElapsed?: number;
};

const weightedStoneTypes = [
  // 주로 화성암
  { type: 'basalt',       weight: 12 }, // 해양 지각 주 구성
  { type: 'granite',      weight: 10 }, // 대륙 지각 주 구성
  { type: 'gabbro',       weight: 6 },
  { type: 'diorite',      weight: 3 },
  { type: 'andesite',     weight: 4 },
  { type: 'obsidian',     weight: 1 },
  { type: 'pumice',       weight: 1 },
  { type: 'rhyolite',     weight: 2 },
  { type: 'scoria',       weight: 1 },
  { type: 'tuff',         weight: 2 },
  { type: 'pegmatite',    weight: 1 },

  // 주로 변성암
  { type: 'gneiss',       weight: 8 },
  { type: 'schist',       weight: 6 },
  { type: 'quartzite',    weight: 3 },
  { type: 'slate',        weight: 3 },
  { type: 'marble',       weight: 2 },

  // 주로 퇴적암
  { type: 'conglomerate', weight: 1 },
  { type: 'sandstone',    weight: 5 },
  { type: 'shale',        weight: 5 },
  { type: 'limestone',    weight: 6 },
  { type: 'chert',        weight: 2 },
  { type: 'dolomite',     weight: 2 },
  { type: 'marl',         weight: 1 },

  // 광물(또는 보석/준보석)
  { type: 'agate',        weight: 1 }, // 상대적으로 희귀
  { type: 'calcite',      weight: 3 }, // 방해석(석회암 주성분)
  { type: 'feldspar',     weight: 10 },// 지각 내 가장 풍부한 광물군
  { type: 'mica',         weight: 3 },
  { type: 'pyrite',       weight: 1 },
  { type: 'quartz',       weight: 8 }, // 장석 다음으로 풍부
  { type: 'sapphire',     weight: 1 }, // 희귀 보석
];

export function getRandomStoneType() {
  const totalWeight = weightedStoneTypes.reduce((acc, stone) => acc + stone.weight, 0);
  let random = Math.random() * totalWeight;
  for (const stone of weightedStoneTypes) {
    if (random < stone.weight) {
      return stone.type;
    }
    random -= stone.weight;
  }
  return weightedStoneTypes[0].type;
}

const initialType = getRandomStoneType();

export const currentStone = writable<StoneType>({
  id: crypto.randomUUID(),
  type: initialType,
  baseSize: 1,
  totalElapsed: 0,
  name: initialType
});
