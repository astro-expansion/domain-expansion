import type { RenderDestination, RenderDestinationChunk, RenderInstance } from "astro/runtime/server/render/common.js";
import { rootDebug } from "./debug.ts";

const debug = rootDebug.extend('cache');

export class Cache {
  private readonly inMemory = new Map<string, RenderInstance | null>();

  private readonly loading = new Map<string, Promise<RenderInstance | null>>();

  public constructor(
    private readonly cacheDir: string,
  ) { }

  public async saveRenderer(key: string, renderer: RenderInstance): Promise<void> {
    const chunks: RenderDestinationChunk[] = [];

    const cachedDestination: RenderDestination = {
      write(chunk) {
        chunks.push(chunk);
      },
    };

    await renderer.render(cachedDestination);

    // TODO: Serialize the chunks

    // TODO: Write the serialized chunks to file

    // TODO: Construct a renderer from the chunks
  }

  public getRenderer(key: string): Promise<RenderInstance | null> {
    const fromMemory = this.inMemory.get(key);
    if (fromMemory !== undefined) return Promise.resolve(fromMemory);

    const loading = this.loading.get(key);
    if (loading !== undefined) return loading;

    // Use a 3-stage cache with a loading stage holding the promises
    // to avoid duplicate reading from not caching the promise
    // and memory leaks to only caching the promises.
    const newPromise = this.loadRenderer(key);
    this.loading.set(key, newPromise);

    newPromise
      .then(
        result => {
          this.inMemory.set(key, result);
        }
      )
      .finally(() => {
        this.loading.delete(key);
      });

    return newPromise;
  }

  private async loadRenderer(key: string): Promise<RenderInstance | null> {
    // TODO: Read the chunks from file
    //
    // TODO: Parse the chunks

    // TODO: Construct a renderer from the chunks
    return null;
  }

  private static serializeChunks(chunks: RenderDestinationChunk[]) {

  }
}
