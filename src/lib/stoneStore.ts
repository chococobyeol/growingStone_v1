import { writable } from 'svelte/store';

export type StoneType = {
  id: string;
  type: string;
  baseSize: number;
  name: string;
  totalElapsed?: number;
};
const weightedStoneTypes = [
  { type: 'andesite', weight: 1 },
  { type: 'basalt', weight: 1 },
  { type: 'conglomerate', weight: 1 },
  { type: 'gneiss', weight: 1 },
  { type: 'granite', weight: 1 },
  { type: 'limestone', weight: 1 },
  { type: 'quartzite', weight: 1 },
  { type: 'sandstone', weight: 1 },
  { type: 'shale', weight: 1 },
  { type: 'tuff', weight: 1 },
  { type: 'chert', weight: 1 },
  { type: 'diorite', weight: 1 },
  { type: 'dolomite', weight: 1 },
  { type: 'gabbro', weight: 1 },
  { type: 'marl', weight: 1 },
  { type: 'obsidian', weight: 1 },
  { type: 'pumice', weight: 1 },
  { type: 'rhyolite', weight: 1 },
  { type: 'scoria', weight: 1 },
  { type: 'slate', weight: 1 }
];

function getRandomStoneType() {
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
