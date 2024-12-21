import { rootDebug } from "./debug.ts";
import { RenderFileStore, type ValueThunk } from "./renderFileStore.ts";
import type { AstroFactoryReturnValue } from "astro/runtime/server/render/astro/factory.js";

const debug = rootDebug.extend('cache');

type MaybePromise<T> = Promise<T> | T;

export class Cache {
  private readonly inMemory = new Map<string, ValueThunk | null>();

  private readonly loading = new Map<string, Promise<ValueThunk | null>>();

  private readonly persisted: RenderFileStore;

  public constructor(
    cacheDir: string,
  ) {
    this.persisted = new RenderFileStore(cacheDir);
  }

  public async saveValue(key: string, factoryValue: AstroFactoryReturnValue): Promise<AstroFactoryReturnValue> {
    const promise = this.persisted.persistValue(key, factoryValue);
    this.storeLoadingStage(key, promise);

    const thunk = await promise;
    return thunk();
  }

  public async getValue(
    key: string,
    loadFresh: () => MaybePromise<AstroFactoryReturnValue>,
  ): Promise<AstroFactoryReturnValue> {
    const thunk = await this.getCachedRenderer(key);

    if (thunk) return thunk();

    return this.saveValue(key, await loadFresh());
  }

  private getCachedRenderer(key: string): Promise<ValueThunk | null> {
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

  private storeLoadingStage(key: string, promise: Promise<ValueThunk | null>): void {
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
