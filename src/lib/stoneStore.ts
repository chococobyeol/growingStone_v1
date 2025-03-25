// 파일 경로: src/lib/stoneStore.ts, 파일명: stoneStore.ts
import { writable } from 'svelte/store';

export interface StoneType {
  id: string;
  type: string;
  baseSize: number;
  name: string;
  totalElapsed?: number;
  discovered_at?: string;
  last_updated?: string;
  manualEdit?: boolean;
}

const weightedStoneTypes = [
  // Igneous (총 0.45)
  { type: 'granite',    weight: 0.1517 },
  { type: 'rhyolite',   weight: 0.0758 },
  { type: 'andesite',   weight: 0.0506 },
  { type: 'diorite',    weight: 0.0253 },
  { type: 'gabbro',     weight: 0.0253 },
  /* 추가된 돌: dacite */
  { type: 'dacite',     weight: 0.0253 },
  /* 추가된 돌: trachyte */
  { type: 'trachyte',   weight: 0.0253 },
  { type: 'obsidian',   weight: 0.0101 },
  { type: 'pumice',     weight: 0.0101 },
  { type: 'basalt',     weight: 0.0152 },
  { type: 'scoria',     weight: 0.0101 },
  { type: 'tuff',       weight: 0.0101 },
  { type: 'pegmatite',  weight: 0.0152 },

  // Metamorphic (총 0.45)
  { type: 'gneiss',         weight: 0.1350 },
  { type: 'schist',         weight: 0.1125 },
  { type: 'quartzite',      weight: 0.0675 },
  { type: 'slate',          weight: 0.0450 },
  { type: 'marble',         weight: 0.0225 },
  /* 추가된 돌: phyllite */
  { type: 'phyllite',       weight: 0.0450 },
  /* 추가된 돌: serpentinite */
  { type: 'serpentinite',   weight: 0.0135 },
  /* 추가된 돌: lapislazuli */
  { type: 'lapislazuli',    weight: 0.0090 },

  // Sedimentary (총 0.05)
  { type: 'sandstone',    weight: 0.0150 },
  { type: 'shale',        weight: 0.0125 },
  { type: 'limestone',    weight: 0.0100 },
  { type: 'conglomerate', weight: 0.0050 },
  { type: 'chert',        weight: 0.0025 },
  { type: 'dolomite',     weight: 0.0025 },
  { type: 'marl',         weight: 0.0015 },
  /* 추가된 돌: chalk */
  { type: 'chalk',        weight: 0.0010 },

  // Minerals (총 0.05)
  { type: 'quartz',       weight: 0.0093 },
  { type: 'feldspar',     weight: 0.0069 },
  { type: 'calcite',      weight: 0.0046 },
  { type: 'mica',         weight: 0.0046 },
  { type: 'agate',        weight: 0.0023 },
  { type: 'pyrite',       weight: 0.0023 },
  { type: 'sapphire',     weight: 0.0023 },
  { type: 'bauxite',      weight: 0.0019 },
  { type: 'cassiterite',  weight: 0.0019 },
  { type: 'chalcopyrite', weight: 0.0019 },
  { type: 'cinnabar',     weight: 0.0014 },
  { type: 'galena',       weight: 0.0014 },
  { type: 'gold',         weight: 0.0014 },
  { type: 'hematite',     weight: 0.0014 },
  { type: 'magnetite',    weight: 0.0014 },
  { type: 'malachite',    weight: 0.0014 },
  { type: 'sphalerite',   weight: 0.0014 },
  /* 추가된 돌: amethyst */
  { type: 'amethyst', weight: 0.0009 },
  /* 추가된 돌: emerald */
  { type: 'emerald',  weight: 0.0009 },
  /* 추가된 돌: ruby */
  { type: 'ruby',     weight: 0.0009 },
  /* 추가된 돌: topaz */
  { type: 'topaz',    weight: 0.0009 }
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
  name: initialType,
  last_updated: new Date().toISOString()
});
