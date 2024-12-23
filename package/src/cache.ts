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

  public initialize(): Promise<void> {
    return this.persisted.initialize();
  }

  public saveRenderValue({ key, factoryValue, ...options }: {
    key: string,
    factoryValue: AstroFactoryReturnValue,
    persist: boolean,
    skipInMemory: boolean,
  }): Promise<ValueThunk> {
    const promise = options.persist
      ? this.persisted.saveRenderValue(key, factoryValue)
      : RenderFileStore.denormalizeValue(factoryValue).then(result => result.clone);
    if (!options.skipInMemory) this.valueCache.storeLoading(key, promise);
    return promise;
  }

  public async getRenderValue({ key, loadFresh, ...options }: {
    key: string,
    loadFresh: Thunk<MaybePromise<AstroFactoryReturnValue>>,
    persist: boolean,
    force: boolean,
    skipInMemory: boolean
  }): Promise<{ cached: boolean, value: ValueThunk }> {
    const value = await this.getStoredRenderValue(key, options.force, options.skipInMemory);

    if (value) return { cached: true, value };

    return {
      cached: false,
      value: await this.saveRenderValue({
        ...options,
        key,
        factoryValue: await loadFresh(),
      }),
    };
  }

  public saveMetadata({ key, metadata, persist, skipInMemory }: {
    key: string,
    metadata: PersistedMetadata,
    persist: boolean,
    skipInMemory: boolean,
  }): void {
    if (!skipInMemory) this.metadataCache.storeSync(key, metadata);
    if (persist) this.persisted.saveMetadata(key, metadata);
  }

  public async getMetadata({ key, skipInMemory }: {
    key: string,
    skipInMemory: boolean,
  }): Promise<PersistedMetadata | null> {
    const fromMemory = this.metadataCache.get(key);
    if (fromMemory) {
      debug(`Retrieve metadata for "${key}" from memory`);
      inMemoryCacheHit();
      return fromMemory;
    }

    inMemoryCacheMiss();

    const newPromise = this.persisted.loadMetadata(key);
    if (!skipInMemory) this.metadataCache.storeLoading(key, newPromise);

    return newPromise;
  }

  private getStoredRenderValue(key: string, force: boolean, skipInMemory: boolean): MaybePromise<ValueThunk | null> {
    const fromMemory = this.valueCache.get(key);
    if (fromMemory) {
      debug(`Retrieve renderer for "${key}" from memory`);
      inMemoryCacheHit();
      return fromMemory;
    }

    inMemoryCacheMiss();

    if (force) return null;

    const newPromise = this.persisted.loadRenderer(key);
    if (!skipInMemory) this.valueCache.storeLoading(key, newPromise);

    return newPromise;
  }
}
