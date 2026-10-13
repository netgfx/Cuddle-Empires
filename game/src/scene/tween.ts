// Tiny promise wrapper around anime.js v4 `animate`.
import { animate, type AnimationParams, type EasingParam } from 'animejs';

export function tween<T extends object>(
  target: T,
  props: Partial<Record<keyof T, number | [number, number]>>,
  duration: number,
  ease: EasingParam = 'outQuad',
  onUpdate?: () => void,
): Promise<void> {
  return new Promise((resolve) => {
    if (duration <= 0) {
      for (const [k, v] of Object.entries(props)) (target as Record<string, number>)[k] = Array.isArray(v) ? v[1] : (v as number);
      onUpdate?.();
      resolve();
      return;
    }
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    const params = { ...(props as Record<string, number | [number, number]>), duration, ease, onComplete: finish } as AnimationParams;
    if (onUpdate) params.onUpdate = onUpdate;
    const a = animate(target, params);
    // background tabs pause the anime.js engine: never let the director wait on that
    setTimeout(() => { if (!done) { a.complete(); finish(); } }, duration + 400);
  });
}
