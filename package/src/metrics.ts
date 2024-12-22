type Metrics =
  | 'in-memory-cache-hit'
  | 'in-memory-cache-miss'
  | 'fs-cache-hit'
  | 'fs-cache-miss'
  | 'loaded-data-size'
  | 'stored-data-size'
  | 'loaded-compressed-size'
  | 'stored-compressed-size';

const metricState: Record<string, number> = {};

function makeTracker(name: Metrics): (n?: number) => void {
  metricState[name] = 0;
  return (n = 1) => { metricState[name]! += n; };
}

export const inMemoryCacheHit = makeTracker('in-memory-cache-hit');
export const inMemoryCacheMiss = makeTracker('in-memory-cache-miss');
export const fsCacheHit = makeTracker('fs-cache-hit');
export const fsCacheMiss = makeTracker('fs-cache-miss');
export const trackLoadedData = makeTracker('loaded-data-size');
export const trackStoredData = makeTracker('stored-data-size');
export const trackLoadedCompressedData = makeTracker('loaded-compressed-size');
export const trackStoredCompressedData = makeTracker('stored-compressed-size');

export const collectMetrics = (): Record<Metrics, number> => ({ ...metricState } as Record<Metrics, number>);
