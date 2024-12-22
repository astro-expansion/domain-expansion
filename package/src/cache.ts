import type { AstroFactoryReturnValue } from "astro/runtime/server/render/astro/factory.js";
import { rootDebug } from "./debug.js";
import { type MaybePromise, type Thunk } from "./utils.js";
import { type PersistedMetadata, RenderFileStore } from "./renderFileStore.js";
import { inMemoryCacheHit, inMemoryCacheMiss } from "./metrics.js";
import { MemoryCache } from "./inMemoryLRU.js";

const debug = rootDebug.extend('cache');

type ValueThunk = Thunk<AstroFactoryReturnValue>;

export class Cache {
  private readonly valueCache = new MemoryCache<Thunk<AstroFactoryReturnValue> | null>();

  private readonly metadataCache = new MemoryCache<PersistedMetadata | null>();

  private readonly persisted: RenderFileStore;

  public constructor(
    cacheDir: string,
  ) {
    this.persisted = new RenderFileStore(cacheDir);
  }

  public saveRenderValue(
    key: string,
    factoryValue: AstroFactoryReturnValue,
    persist: boolean = true,
  ): Promise<ValueThunk> {
    const promise = persist
      ? this.persisted.saveRenderValue(key, factoryValue)
      : RenderFileStore.denormalizeValue(factoryValue).then(result => result.clone);
    this.valueCache.storeLoading(key, promise);
    return promise;
  }

  public async getRenderValue(
    key: string,
    loadFresh: Thunk<MaybePromise<AstroFactoryReturnValue>>,
    persist: boolean = true,
    force: boolean = false,
  ): Promise<{ cached: boolean, value: ValueThunk }> {
    const value = await this.getStoredRenderValue(key, force);

    if (value) return { cached: true, value };

    return {
      cached: false,
      value: await this.saveRenderValue(key, await loadFresh(), persist),
    };
  }

  public async saveMetadata({ key, metadata, persist = true }: {
    key: string,
    metadata: PersistedMetadata,
    persist: boolean
  }): Promise<void> {
    this.metadataCache.storeSync(key, metadata);
    if (persist) {
      await this.persisted.saveMetadata(key, metadata);
    }
  }

  public async getMetadata(key: string): Promise<PersistedMetadata | null> {
    const fromMemory = this.metadataCache.get(key);
    if (fromMemory) {
      debug(`Retrieve metadata for "${key}" from memory`);
      inMemoryCacheHit();
      return fromMemory;
    }

    inMemoryCacheMiss();

    const newPromise = this.persisted.loadMetadata(key);
    this.metadataCache.storeLoading(key, newPromise);

    return newPromise;
  }

  private getStoredRenderValue(key: string, force: boolean): MaybePromise<ValueThunk | null> {
    const fromMemory = this.valueCache.get(key);
    if (fromMemory) {
      debug(`Retrieve renderer for "${key}" from memory`);
      inMemoryCacheHit();
      return fromMemory;
    }

    inMemoryCacheMiss();

    if (force) return null;

    const newPromise = this.persisted.loadRenderer(key);
    this.valueCache.storeLoading(key, newPromise);

    return newPromise;
  }
}
