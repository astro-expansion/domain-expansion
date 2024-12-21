import type { AstroFactoryReturnValue } from "astro/runtime/server/render/astro/factory.js";
import { rootDebug } from "./debug.js";
import { Either, type Thunk } from "./utils.js";
import { type PersistedMetadata, RenderFileStore } from "./renderFileStore.js";

const debug = rootDebug.extend('cache');

type MaybePromise<T> = Promise<T> | T;

class MemoryCache<T> {
  readonly #cache = new Map<string, Either<T, Promise<T>>>();

  public get(key: string): MaybePromise<T> | null {
    const cached = this.#cache.get(key);

    if (!cached) return null;
    if (Either.isLeft(cached)) return cached.value;

    return cached.value;
  }

  public storeSync(key: string, value: T): void {
    this.#cache.set(key, Either.left(value));
  }

  public storeLoading(key: string, promise: Promise<T>): void {
    // Use a 3-stage cache with a loading stage holding the promises
    // to avoid duplicate reading from not caching the promise
    // and memory leaks to only caching the promises.

    const stored = Either.right(promise);
    this.#cache.set(key, stored);
    promise
      .then(
        result => {
          const cached = this.#cache.get(key);
          if (!Object.is(cached, stored)) return;
          debug(`Storing cached render for "${key}"`);
          this.#cache.set(key, Either.left(result));
        }
      )
      .finally(() => {
        const cached = this.#cache.get(key);
        if (!Object.is(cached, stored)) return;
        debug(`Clearing loading state for "${key}"`);
        this.#cache.delete(key);
      });
  }
}

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

  public saveRenderValue(key: string, factoryValue: AstroFactoryReturnValue): Promise<ValueThunk> {
    const promise = this.persisted.saveRenderValue(key, factoryValue);
    this.valueCache.storeLoading(key, promise);
    return promise;
  }

  public async getRenderValue(
    key: string,
    loadFresh: Thunk<MaybePromise<AstroFactoryReturnValue>>,
  ): Promise<{ cached: boolean, value: ValueThunk }> {
    const value = await this.getStoredRenderValue(key);

    if (value) return { cached: true, value };

    return {
      cached: false,
      value: await this.saveRenderValue(key, await loadFresh()),
    };
  }

  public saveMetadata(key: string, metadata: PersistedMetadata): Promise<void> {
    const promise = this.persisted.saveMetadata(key, metadata);
    this.metadataCache.storeSync(key, metadata);
    return promise;
  }

  public async getMetadata(key: string,): Promise<PersistedMetadata | null> {
    const fromMemory = this.metadataCache.get(key);
    if (fromMemory) {
      debug(`Retrieve renderer for "${key}" from memory`);
      return fromMemory;
    }

    const newPromise = this.persisted.loadMetadata(key);
    this.metadataCache.storeLoading(key, newPromise);

    return newPromise;
  }

  private getStoredRenderValue(key: string): MaybePromise<ValueThunk | null> {
    const fromMemory = this.valueCache.get(key);
    if (fromMemory) {
      debug(`Retrieve renderer for "${key}" from memory`);
      return fromMemory;
    }

    const newPromise = this.persisted.loadRenderer(key);
    this.valueCache.storeLoading(key, newPromise);

    return newPromise;
  }
}
