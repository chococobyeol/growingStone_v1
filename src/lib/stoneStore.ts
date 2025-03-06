import { writable } from 'svelte/store';

export type StoneType = {
  id: string;
  type: string;
  baseSize: number;
  name: string;
  totalElapsed?: number;
};

const weightedStoneTypes = [
  // 주로 화성암 (총 0.2000)
  { type: 'basalt',       weight: 0.0100 },
  { type: 'granite',      weight: 0.1000 },
  { type: 'gabbro',       weight: 0.0200 },
  { type: 'diorite',      weight: 0.0100 },
  { type: 'andesite',     weight: 0.0200 },
  { type: 'obsidian',     weight: 0.0050 },
  { type: 'pumice',       weight: 0.0050 },
  { type: 'rhyolite',     weight: 0.0100 },
  { type: 'scoria',       weight: 0.0050 },
  { type: 'tuff',         weight: 0.0100 },
  { type: 'pegmatite',    weight: 0.0050 },

  // 주로 변성암 (총 0.2000)
  { type: 'gneiss',       weight: 0.0728 },
  { type: 'schist',       weight: 0.0545 },
  { type: 'quartzite',    weight: 0.0273 },
  { type: 'slate',        weight: 0.0273 },
  { type: 'marble',       weight: 0.0183 },

  // 주로 퇴적암 (총 0.4000)
  { type: 'conglomerate', weight: 0.0180 },
  { type: 'sandstone',    weight: 0.0910 },
  { type: 'shale',        weight: 0.0910 },
  { type: 'limestone',    weight: 0.1090 },
  { type: 'chert',        weight: 0.0365 },
  { type: 'dolomite',     weight: 0.0365 },
  { type: 'marl',         weight: 0.0180 },

  // 광물(또는 보석/준보석) (총 0.2000)
  { type: 'agate',        weight: 0.0043 },
  { type: 'calcite',      weight: 0.0130 },
  { type: 'feldspar',     weight: 0.0435 },
  { type: 'mica',         weight: 0.0130 },
  { type: 'pyrite',       weight: 0.0043 },
  { type: 'quartz',       weight: 0.0348 },
  { type: 'sapphire',     weight: 0.0043 },
  { type: 'bauxite',      weight: 0.0087 },
  { type: 'cassiterite',  weight: 0.0043 },
  { type: 'chalcopyrite', weight: 0.0087 },
  { type: 'cinnabar',     weight: 0.0087 },
  { type: 'galena',       weight: 0.0043 },
  { type: 'gold',         weight: 0.0043 },
  { type: 'hematite',     weight: 0.0130 },
  { type: 'magnetite',    weight: 0.0130 },
  { type: 'malachite',    weight: 0.0087 },
  { type: 'sphalerite',   weight: 0.0087 },
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
