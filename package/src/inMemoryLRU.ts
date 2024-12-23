import { types } from "node:util";
import { rootDebug } from "./debug.js";
import { Either, type MaybePromise } from "./utils.js";

// Arbitrary limit for now
const CACHE_LIMIT = 4096;

const debug = rootDebug.extend('lru-cache');

export class MemoryCache<T> {
  readonly #cacheLimit: number;
  readonly #cache = new Map<string, Either<T, Promise<T>>>();

  public constructor(cacheLimit: number = CACHE_LIMIT) {
    this.#cacheLimit = cacheLimit;
  }

  public async load(key: string, loader: () => MaybePromise<T>): Promise<T> {
    const cached = await this.get(key);
    if (cached) return cached;

    const fresh = loader();

    if (types.isPromise(fresh)) {
      return this.storeLoading(key, fresh);
    }

    this.storeSync(key, fresh);
    return fresh;
  }

  public async getAll(): Promise<Record<string, T>> {
    return Object.fromEntries(await Promise.all(
      Array.from(this.#cache.entries())
        .map(([k, v]) => (
          Either.isLeft(v)
            ? [k, v.value]
            : v.value.then(value => [k, value])
        ))
    ));
  }

  public get(key: string): MaybePromise<T> | null {
    const cached = this.#cache.get(key);

    if (!cached) return null;

    this.#cache.delete(key);
    this.#cache.set(key, cached);

    while (this.#cache.size > this.#cacheLimit) {
      const { value } = this.#cache.keys().next();
      this.#cache.delete(value!);
    }

    if (Either.isLeft(cached)) return cached.value;

    return cached.value;
  }

  public storeSync(key: string, value: T): void {
    this.#cache.set(key, Either.left(value));
  }

  public storeLoading(key: string, promise: Promise<T>): Promise<T> {
    // Use a 3-stage cache with a loading stage holding the promises
    // to avoid duplicate reading from not caching the promise
    // and memory leaks to only caching the promises.

    const stored = Either.right(promise);
    this.#cache.set(key, stored);

    return promise
      .then(
        result => {
          const cached = this.#cache.get(key);
          if (!Object.is(cached, stored)) return cached!.value;
          debug(`Storing cached render for "${key}"`);
          this.#cache.set(key, Either.left(result));

          return result;
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
