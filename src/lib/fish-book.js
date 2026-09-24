import { browserBridge } from './browser-bridge';

export function fishBook() { return window.fishBook || browserBridge; }

export function bookTone(index) {
  const tones = [
    'from-amber-800 to-stone-950',
    'from-emerald-800 to-slate-950',
    'from-rose-800 to-stone-950',
    'from-sky-800 to-slate-950',
    'from-violet-800 to-slate-950',
  ];
  return tones[index % tones.length];
}

export function displayTitle(fileName) {
  return fileName.replace(/\.(txt|epub|html?|fb2)$/i, '');
}
