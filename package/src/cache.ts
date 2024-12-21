import { rootDebug } from "./debug.ts";
import { RenderFileStore, type PersistedValue, type PersistingValue } from "./renderFileStore.ts";

const debug = rootDebug.extend('cache');

type MaybePromise<T> = Promise<T> | T;

export class Cache {
  private readonly inMemory = new Map<string, PersistedValue | null>();

  private readonly loading = new Map<string, Promise<PersistedValue | null>>();

  private readonly persisted: RenderFileStore;

  public constructor(
    cacheDir: string,
  ) {
    this.persisted = new RenderFileStore(cacheDir);
  }

  public async saveValue(key: string, factoryValue: PersistingValue): Promise<PersistingValue> {
    const promise = this.persisted.persistValue(key, factoryValue);
    this.storeLoadingStage(key, promise);

    const { value } = await promise;
    return {
      ...factoryValue,
      value: value(),
    };
  }

  public async getValue(
    key: string,
    loadFresh: () => MaybePromise<PersistingValue>,
  ): Promise<PersistingValue> {
    const value = await this.getCachedRenderer(key);

    if (value) return {
      ...value,
      metadata: () => value.metadata,
      value: value.value(),
    }

    return this.saveValue(key, await loadFresh());
  }

  private getCachedRenderer(key: string): Promise<PersistedValue | null> {
    const fromMemory = this.inMemory.get(key);
    if (fromMemory !== undefined) {
      debug(`Retrieve renderer for "${key}" from memory`);
      return Promise.resolve(fromMemory);
    }

    const loading = this.loading.get(key);
    if (loading !== undefined) {
      debug(`Retrieve renderer for "${key}" from loading stage`);
      return loading;
    }

    // Use a 3-stage cache with a loading stage holding the promises
    // to avoid duplicate reading from not caching the promise
    // and memory leaks to only caching the promises.
    const newPromise = this.persisted.loadRenderer(key);
    this.storeLoadingStage(key, newPromise);

    return newPromise;
  }

  private storeLoadingStage(key: string, promise: Promise<PersistedValue | null>): void {
    this.loading.set(key, promise);
    this.inMemory.delete(key);
    promise
      .then(
        result => {
          debug(`Storing cached render for "${key}"`);
          this.inMemory.set(key, result);
        }
      )
      .finally(() => {
        debug(`Clearing loading state for "${key}"`);
        this.loading.delete(key);
      });
  }
}
