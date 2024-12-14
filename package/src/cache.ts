import type { RenderDestination, RenderDestinationChunk, RenderInstance as BaseRender } from "astro/runtime/server/render/common.js";
import { rootDebug } from "./debug.ts";
import { RenderFileStore } from "./renderFileStore.ts";
import { ReadableStream } from 'node:stream/web';
import { HTMLBytes, HTMLString } from "astro/runtime/server/escape.js";

const debug = rootDebug.extend('cache');

type MaybePromise<T> = Promise<T> | T;

export type RenderInstance = BaseRender & {
  scope: string;
}

/**
  * Polyfill for `Promise.withResolvers`
  */
function promiseWithResolvers<T>(): PromiseWithResolvers<T> {
  let resolve: (res: T | PromiseLike<T>) => void;
  let reject: (err?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve: resolve!, reject: reject! };
}

export class Cache {
  private readonly inMemory = new Map<string, RenderInstance | null>();

  private readonly loading = new Map<string, Promise<RenderInstance | null>>();

  private readonly persisted: RenderFileStore;

  public constructor(
    cacheDir: string,
  ) {
    this.persisted = new RenderFileStore(cacheDir);
  }

  public saveRenderer(key: string, scope: string, renderer: BaseRender): Promise<RenderInstance> {
    const { promise, resolve, reject } = promiseWithResolvers<RenderInstance>();
    this.storeLoadingStage(key, promise);

    Cache.rendererToChunks(renderer).then(chunks => {
      const cachedRenderer = Cache.rendererFromChunks(scope, chunks);
      this.persisted.persistRenderer(key, scope, chunks)
        .catch(e => {
          debug('Error persisting renderer', e);
        })
        .finally(() => {
          resolve(cachedRenderer);
        })
    })
      .catch(e => {
        debug('Failed to render to chunks for caching', e);
        reject(e);
      });

    return promise;
  }

  public getRenderer(
    scope: string,
    loadKey: () => MaybePromise<{
      key: string
      loadFresh: () => MaybePromise<BaseRender>,
    }>,
  ): RenderInstance {
    const innerRenderer = Promise.resolve(loadKey())
      .then(({ key, loadFresh }) => this.getCachedRenderer(key)
        .then(
          async renderer => {
            if (renderer !== null) {
              debug(`Acquired cached renderer for "${key}"`);
              return renderer;
            }

            return this.saveRenderer(key, scope, await loadFresh());
          }
        ))
      .then(renderer => (
        renderer.scope === scope ? renderer : Cache.replaceStringsInRenderer(
          renderer,
          renderer.scope,
          scope,
          scope,
        )
      ));

    return {
      scope,
      render: async (destination) => {
        debug("Rendering with lazy renderer");
        const renderer = await innerRenderer;

        return renderer.render(destination);
      }
    }
  }

  private getCachedRenderer(key: string): Promise<RenderInstance | null> {
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
    const newPromise = this.persisted.loadRenderer(key)
      .then((stored) => stored === null ? null : Cache.rendererFromChunks(stored.scope, stored.chunks));
    this.storeLoadingStage(key, newPromise);

    return newPromise;
  }

  private storeLoadingStage(key: string, promise: Promise<RenderInstance | null>): void {
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

  private static rendererFromChunks(scope: string, chunks: RenderDestinationChunk[]): RenderInstance {
    return {
      scope,
      render: (destination) => {
        for (const chunk of chunks) {
          destination.write(chunk);
        }
      }
    }
  }

  public static async rendererToChunks(renderer: BaseRender): Promise<RenderDestinationChunk[]> {
    const chunks: RenderDestinationChunk[] = [];

    const cachedDestination: RenderDestination = {
      write(chunk) {
        chunks.push(chunk);
      },
    };

    await renderer.render(cachedDestination);

    return chunks;
  }

  private static replaceStringEverywhere(expression: any, searchValue: string | RegExp, replaceValue: string): any;
  private static replaceStringEverywhere(expression: any, searchValue: string | RegExp, replacer: (substring: string, ...args: any[]) => string): any;
  private static replaceStringEverywhere(
    expression: any,
    ...replaceArgs: /* I unga, therefore I bunga */[any, any]
  ): any {
    switch (typeof expression) {
      case "string":
        return expression.replaceAll(...replaceArgs);
      case "object": {
        if (expression instanceof String) {
          // A chunk can be a subclass of `String` with special meaning to Astro, like `HTMLString`.
          // When calling `.replaceAll` on a subclass of `String` the result is a plain string without
          // the custom constructor.
          // So we need to construct a new instance of the custom subclass after replacing the contents
          // to keep the semantics.
          return new (expression.constructor as StringConstructor)(expression.replaceAll(...replaceArgs));
        }

        if (Cache.isInstanceByName<HTMLBytes>('HTMLBytes', expression)) {
          return new HTMLString(
            Buffer.from(expression).toString('utf-8')
              .replaceAll(...replaceArgs)
          );
        }

        if (expression instanceof Response) {
          return new Response(
            ReadableStream.from({
              async*[Symbol.asyncIterator]() {
                const text = await expression.text();

                yield text.replaceAll(...replaceArgs);
              }
            }),
            expression,
          )
        }

        if (expression instanceof Promise) {
          return expression.then(resolved => this.replaceStringEverywhere(resolved, ...replaceArgs));
        }

        if (
          expression !== null
          && Object.keys(expression).length === 1
          && 'render' in expression
          && typeof expression.render === 'function'
        ) {
          return this.replaceStringsInRenderer(expression, ...replaceArgs);
        }

        return expression;
      }
      case "function":
        return this.replaceStringEverywhere([expression()], ...replaceArgs);
      default:
        return expression;
    }
  }

  private static replaceStringsInRenderer(expression: any, searchValue: string | RegExp, replaceValue: string, scope?: string): any;
  private static replaceStringsInRenderer(expression: any, searchValue: string | RegExp, replacer: (substring: string, ...args: any[]) => string, scope?: string): any;
  private static replaceStringsInRenderer(renderer: RenderInstance, search: any, replace: any, scope?: string): RenderInstance {
    return {
      scope: scope ?? renderer.scope,
      render: (destination) => renderer.render({
        write: chunk => {
          destination.write(this.replaceStringEverywhere(chunk, search, replace));
        }
      })
    };
  }

  private static isInstanceByName<T>(name: string, chunk: any): chunk is T {
    return chunk.constructor.name === name;
  }
}
