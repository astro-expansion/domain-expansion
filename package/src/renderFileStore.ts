import { createResolver } from "astro-integration-kit";
import type { RenderDestination, RenderDestinationChunk } from "astro/runtime/server/render/common.js";
import { rootDebug } from "./debug.js";
import { readFile, writeFile } from "fs/promises";
import { mkdir } from "fs/promises";
import type { AstroFactoryReturnValue } from "astro/runtime/server/render/astro/factory.js";
import { Either, runtime, type Thunk } from "./utils.js";
import { createHash } from 'node:crypto';
import type { SSRMetadata } from "astro";
import type { RenderInstruction } from "astro/runtime/server/render/instruction.js";
import type { RenderTemplateResult } from "astro/runtime/server/render/astro/render-template.js";
import * as zlib from "node:zlib";
import { promisify } from "node:util";
import { fsCacheHit, fsCacheMiss, trackLoadedCompressedData, trackLoadedData, trackStoredCompressedData, trackStoredData } from "./metrics.js";
import type { ContextTracking } from "./contextTracking.js";
import { MemoryCache } from "./inMemoryLRU.js";

const
  gzip = promisify(zlib.gzip),
  gunzip = promisify(zlib.gunzip);

const NON_SERIALIZABLE_RENDER_INSTRUCTIONS = [
  'renderer-hydration-script',
] satisfies Array<RenderInstruction['type']>;

type SerializableRenderInstruction = Exclude<RenderInstruction, {
  type: (typeof NON_SERIALIZABLE_RENDER_INSTRUCTIONS)[number]
}>;

type ChunkSerializationMap = {
  primitive: { value: string | number | boolean },
  htmlString: { value: string },
  htmlBytes: { value: string },
  slotString: {
    value: string,
    renderInstructions: Array<SerializableRenderInstruction> | undefined,
  },
  renderInstruction: {
    instruction: SerializableRenderInstruction,
  },
  arrayBufferView: {
    value: string,
  }
  response: {
    body: string,
    status: number,
    statusText: string,
    headers: Record<string, string>,
  },
}

type SerializedChunk<K extends keyof ChunkSerializationMap = keyof ChunkSerializationMap> = {
  [T in K]: ChunkSerializationMap[T] & { type: T }
}[K];

type ValueSerializationMap = {
  headAndContent: {
    head: string,
    chunks: SerializedChunk[],
  },
  templateResult: {
    chunks: SerializedChunk[],
  },
  response: ChunkSerializationMap['response'],
}

type SerializedValue<K extends keyof ValueSerializationMap = keyof ValueSerializationMap> = {
  [T in K]: ValueSerializationMap[T] & { type: T }
}[K];

export type PersistedMetadata = Omit<ContextTracking, 'doNotCache' | 'renderingEntry'> & {
  metadata: Omit<SSRMetadata, 'propagators'>,
}

export type SerializedMetadata = Omit<ContextTracking, 'doNotCache' | 'renderingEntry'> & {
  metadata: {
    hasHydrationScript: boolean;
    rendererSpecificHydrationScripts: Array<string>;
    renderedScripts: Array<string>;
    hasDirectives: Array<string>;
    hasRenderedHead: boolean;
    headInTree: boolean;
    extraHead: string[];
  }
}

const debug = rootDebug.extend('file-store');

type ValueThunk = Thunk<AstroFactoryReturnValue>;

export class RenderFileStore {
  private readonly gzippedCache = new MemoryCache<Buffer>(Number.POSITIVE_INFINITY);

  private readonly resolver: ReturnType<typeof createResolver>['resolve'];

  public constructor(private readonly cacheDir: string) {
    this.resolver = createResolver(this.cacheDir).resolve;
  }

  public async saveRenderValue(key: string, value: AstroFactoryReturnValue): Promise<ValueThunk> {
    debug('Persisting renderer for ', key);
    const { denormalized, clone } = await RenderFileStore.denormalizeValue(value);

    if (denormalized) {
      const serializedData = Buffer.from(JSON.stringify(denormalized), 'utf-8');
      trackStoredData(serializedData.byteLength);
      const compressedData = await gzip(serializedData, { level: 9 });
      trackStoredCompressedData(compressedData.byteLength);

      const cacheKey = key + ':renderer';

      this.gzippedCache.storeSync(cacheKey, compressedData);
      await writeFile(
        await this.resolvePath(cacheKey),
        compressedData,
      );
    }

    return clone;
  }

  public async loadRenderer(key: string): Promise<ValueThunk | null> {
    try {
      const cacheKey = key + ':renderer';
      const storedData = await this.gzippedCache.load(
        cacheKey,
        async () => await readFile(await this.resolvePath(cacheKey)),
      );
      trackLoadedCompressedData(storedData.byteLength);
      const uncompressedData = await gunzip(storedData);
      trackLoadedData(uncompressedData.byteLength);

      const serializedValue: SerializedValue = JSON.parse(uncompressedData.toString('utf-8'));

      debug('Renderer cache hit', key);
      fsCacheHit();

      return RenderFileStore.normalizeValue(serializedValue);
    } catch {
      debug('Renderer cache miss', key);
      fsCacheMiss();
      return null;
    }
  }

  public async saveMetadata(key: string, metadata: PersistedMetadata): Promise<void> {
    debug('Persisting metadata for ', key);

    const serialized: SerializedMetadata = {
      ...metadata,
      metadata: {
        ...metadata.metadata,
        hasDirectives: Array.from(metadata.metadata.hasDirectives),
        renderedScripts: Array.from(metadata.metadata.renderedScripts),
        rendererSpecificHydrationScripts: Array.from(metadata.metadata.rendererSpecificHydrationScripts),
      },
    };

    const serializedData = Buffer.from(JSON.stringify(serialized), 'utf-8');
    trackStoredData(serializedData.byteLength);
    const compressedData = await gzip(serializedData, { level: 9 });
    trackStoredCompressedData(compressedData.byteLength);

    const cacheKey = key + ':metadata';

    this.gzippedCache.storeSync(cacheKey, compressedData);
    await writeFile(
      await this.resolvePath(cacheKey),
      compressedData,
    );
  }

  public async loadMetadata(key: string): Promise<PersistedMetadata | null> {
    try {
      const cacheKey = key + ':metadata';
      const storedData = await this.gzippedCache.load(
        cacheKey,
        async () => await readFile(await this.resolvePath(cacheKey)),
      );
      trackLoadedCompressedData(storedData.byteLength);
      const uncompressedData = await gunzip(storedData);
      trackLoadedData(uncompressedData.byteLength);

      const serializedValue: SerializedMetadata = JSON.parse(uncompressedData.toString('utf-8'));

      debug('Metadata cache hit', key);
      fsCacheHit();

      return {
        ...serializedValue,
        metadata: {
          ...serializedValue.metadata,
          hasDirectives: new Set(serializedValue.metadata.hasDirectives),
          renderedScripts: new Set(serializedValue.metadata.renderedScripts),
          rendererSpecificHydrationScripts: new Set(serializedValue.metadata.rendererSpecificHydrationScripts),
        },
      };
    } catch {
      debug('Metadata cache miss', key);
      fsCacheMiss();
      return null;
    }
  }

  private async resolvePath(key: string): Promise<string> {
    const hash = createHash('sha3-224')
      .update(key, 'utf8')
      .digest('hex');
    const pathSegments = [hash.substring(0, 6), hash.substring(6)];
    const dir = this.resolver(...pathSegments.slice(0, -1));
    await mkdir(dir, { recursive: true });

    return this.resolver(...pathSegments);
  }

  public static async denormalizeValue(value: AstroFactoryReturnValue): Promise<{ denormalized?: SerializedValue, clone: ValueThunk }> {
    if (value instanceof Response) {
      const denormalized = await RenderFileStore.denormalizeResponse(value);
      return {
        denormalized,
        clone: () => RenderFileStore.normalizeResponse(denormalized),
      };
    }

    if (runtime.isHeadAndContent(value)) {
      const chunks = await RenderFileStore.renderTemplateToChunks(value.content);
      const seminormalChunks = await Promise.all(chunks.map(RenderFileStore.tryDenormalizeChunk));
      const clone = () => runtime.createHeadAndContent(
        value.head,
        RenderFileStore.renderTemplateFromSeminormalizedChunks(seminormalChunks),
      );

      return seminormalChunks.every(Either.isRight)
        ? {
          clone,
          denormalized: {
            type: 'headAndContent',
            head: value.head.toString(),
            chunks: seminormalChunks.map(right => right.value),
          },
        }
        : { clone };
    }

    const chunks = await RenderFileStore.renderTemplateToChunks(value);
    const seminormalChunks = await Promise.all(chunks.map(RenderFileStore.tryDenormalizeChunk));
    const clone = () => RenderFileStore.renderTemplateFromSeminormalizedChunks(seminormalChunks);

    return seminormalChunks.every(Either.isRight)
      ? {
        clone,
        denormalized: {
          type: 'templateResult',
          chunks: seminormalChunks.map(right => right.value),
        },
      }
      : { clone };
  }

  private static normalizeValue(value: SerializedValue): ValueThunk {
    switch (value.type) {
      case "headAndContent": {
        const seminormalChunks = value.chunks.map(Either.right);
        return () => runtime.createHeadAndContent(
          // SAFETY: Astro core is wrong
          new runtime.HTMLString(value.head) as unknown as string,
          RenderFileStore.renderTemplateFromSeminormalizedChunks(seminormalChunks),
        );
      }
      case "templateResult": {
        const seminormalChunks = value.chunks.map(Either.right);
        return () => RenderFileStore.renderTemplateFromSeminormalizedChunks(seminormalChunks);
      }
      case "response":
        return () => RenderFileStore.normalizeResponse(value);
    }
  }

  private static async tryDenormalizeChunk(chunk: RenderDestinationChunk): Promise<Either<RenderDestinationChunk, SerializedChunk>> {
    const deno = await RenderFileStore.denormalizeChunk(chunk);
    return deno === null ? Either.left(chunk) : Either.right(deno);
  }

  private static async denormalizeChunk(chunk: RenderDestinationChunk): Promise<SerializedChunk | null> {
    switch (typeof chunk) {
      case "string":
      case "number":
      case "boolean":
        return {
          type: 'primitive',
          value: chunk,
        };
      case "object":
        break;
      default:
        debug('Unexpected chunk type', chunk);
        return null;
    }

    if (chunk instanceof runtime.HTMLBytes) return {
      type: 'htmlBytes',
      value: Buffer.from(chunk).toString('base64'),
    };

    if (chunk instanceof runtime.SlotString) {
      const instructions = chunk.instructions?.filter(RenderFileStore.isSerializableRenderInstruction);

      // Some instruction was not serializable
      if (instructions?.length !== chunk.instructions?.length) return null;

      return {
        type: 'slotString',
        value: chunk.toString(),
        renderInstructions: instructions,
      };
    }


    if (chunk instanceof runtime.HTMLString) return {
      type: 'htmlString',
      value: chunk.toString(),
    }

    if (chunk instanceof Response) {
      return RenderFileStore.denormalizeResponse(chunk);
    }

    if ('buffer' in chunk) return {
      type: 'arrayBufferView',
      value: Buffer.from(chunk.buffer.slice(
        chunk.byteOffset,
        chunk.byteOffset + chunk.byteLength,
      )).toString('base64')
    }

    if (RenderFileStore.isSerializableRenderInstruction(chunk)) return {
      type: 'renderInstruction',
      instruction: chunk,
    };

    debug('Unexpected chunk type', chunk);
    return null;
  }

  private static normalizeChunk(chunk: SerializedChunk): RenderDestinationChunk {
    /*
    export type RenderDestinationChunk = string | HTMLBytes | HTMLString | SlotString | ArrayBufferView | RenderInstruction | Response;
     */

    switch (chunk.type) {
      case "primitive":
        return chunk.value as string;
      case "htmlString":
        return new runtime.HTMLString(chunk.value);
      case "htmlBytes":
        return new runtime.HTMLBytes(Buffer.from(chunk.value, 'base64'));
      case "slotString":
        return new runtime.SlotString(
          chunk.value,
          chunk.renderInstructions
            ?.map(RenderFileStore.normalizeRenderInstruction) ?? null,
        );
      case "renderInstruction":
        return RenderFileStore.normalizeRenderInstruction(chunk.instruction);
      case "arrayBufferView": {
        const buffer = Buffer.from(chunk.value, 'base64');
        return {
          buffer: buffer.buffer,
          byteLength: buffer.length,
          byteOffset: 0,
        };
      }
      case "response":
        return new Response(chunk.body, {
          headers: chunk.headers
        });
    }
  }

  private static normalizeRenderInstruction(instruction: SerializableRenderInstruction): RenderInstruction {
    // SAFETY: `createRenderInstruction` uses an overload to handle the types of each render instruction
    //         individually. This breaks when the given instruction can be any of them as no overload
    //         accepts them indistinctivelly. Each individual type matches the output so the following
    //         is valid.
    return runtime.createRenderInstruction(instruction as any);
  }

  private static async denormalizeResponse(value: Response): Promise<SerializedValue<'response'> & SerializedChunk<'response'>> {
    return {
      type: 'response',
      body: Buffer.from(await value.arrayBuffer()).toString('base64'),
      status: value.status,
      statusText: value.statusText,
      headers: Object.fromEntries(value.headers.entries()),
    }
  }

  private static normalizeResponse(value: SerializedValue<'response'> | SerializedChunk<'response'>): Response {
    return new Response(value.body, {
      headers: value.headers,
      status: value.status,
      statusText: value.statusText,
    });
  }

  private static async renderTemplateToChunks(value: RenderTemplateResult): Promise<RenderDestinationChunk[]> {
    const chunks: RenderDestinationChunk[] = [];

    const cachedDestination: RenderDestination = {
      write(chunk) {
        chunks.push(chunk);
      },
    };

    await value.render(cachedDestination);

    return chunks;
  }

  private static renderTemplateFromSeminormalizedChunks(chunks: Either<RenderDestinationChunk, SerializedChunk>[]): RenderTemplateResult {
    const template = runtime.renderTemplate(Object.assign([], { raw: [] }));

    return Object.assign(template, {
      render: (destination: RenderDestination) => {
        return new Promise<void>(resolve => {
          setImmediate(() => {
            for (const chunk of chunks) {
              if (Either.isLeft(chunk)) {
                destination.write(chunk.value);
              } else {
                destination.write(RenderFileStore.normalizeChunk(chunk.value));
              }
            }

            resolve();
          });
        });
      }
    })
  }

  private static isSerializableRenderInstruction(
    instruction: RenderInstruction
  ): instruction is SerializableRenderInstruction {
    return !(NON_SERIALIZABLE_RENDER_INSTRUCTIONS as Array<RenderInstruction['type']>)
      .includes(instruction.type);
  }
}
