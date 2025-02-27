import { writable } from 'svelte/store';

export type StoneType = {
  id: string;
  type: string;
  baseSize: number;
  name: string;
  totalElapsed?: number;
};

const stoneTypes = [
  'andesite',
  'basalt',
  'conglomerate',
  'gneiss',
  'granite',
  'limestone',
  'quartzite',
  'sandstone',
  'shale',
  'tuff'
];

function getRandomStoneType() {
  return stoneTypes[Math.floor(Math.random() * stoneTypes.length)];
}

const initialType = getRandomStoneType();

export const currentStone = writable<StoneType>({
  id: crypto.randomUUID(),
  type: initialType,
  baseSize: 1,
  totalElapsed: 0,
  name: initialType
});
