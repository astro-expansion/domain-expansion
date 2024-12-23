import { createResolver } from "astro-integration-kit";
import type { RenderDestination, RenderDestinationChunk } from "astro/runtime/server/render/common.js";
import { rootDebug } from "./debug.js";
import * as fs from 'node:fs';
import type { AstroFactoryReturnValue } from "astro/runtime/server/render/astro/factory.js";
import { Either, runtime, type Thunk } from "./utils.js";
import type { SSRMetadata } from "astro";
import type { RenderInstruction } from "astro/runtime/server/render/instruction.js";
import type { RenderTemplateResult } from "astro/runtime/server/render/astro/render-template.js";
import * as zlib from "node:zlib";
import { promisify } from "node:util";
import { fsCacheHit, fsCacheMiss, trackLoadedCompressedData, trackLoadedData, trackStoredCompressedData, trackStoredData } from "./metrics.js";
import type { ContextTracking } from "./contextTracking.js";
import { MemoryCache } from "./inMemoryLRU.js";
import murmurHash from "murmurhash-native";
import avsc from "avsc";
import { commonTypes, literalType, logicalTypes } from "./avsc.js";

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
  htmlBytes: { value: Buffer },
  slotString: {
    value: string,
    renderInstructions: Array<SerializableRenderInstruction> | undefined,
  },
  renderInstruction: {
    instruction: SerializableRenderInstruction,
  },
  arrayBufferView: {
    value: Buffer,
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

const serializedChunksAvro: avsc.schema.RecordType[] = [
  {
    type: 'record',
    name: 'SerializedPrimitive',
    fields: [
      {
        name: 'type',
        type: literalType('primitive'),
      },
      {
        name: 'value',
        type: ['string', 'float', 'boolean'],
      },
    ]
  },
  {
    type: 'record',
    name: 'SerializedHTMLString',
    fields: [
      {
        name: 'type',
        type: literalType('htmlString'),
      },
      {
        name: 'value',
        type: 'string',
      },
    ]
  },
  {
    type: 'record',
    name: 'SerializedHTMLBytes',
    fields: [
      {
        name: 'type',
        type: literalType('htmlBytes'),
      },
      {
        name: 'value',
        type: 'bytes',
      },
    ]
  },
  {
    type: 'record',
    name: 'SerializedRenderInstructionChunk',
    fields: [
      {
        name: 'type',
        type: literalType('renderInstruction'),
      },
      {
        name: 'instruction',
        type: [
          {
            type: 'record',
            name: 'RenderDirectiveInstruction',
            fields: [
              {
                name: 'type',
                type: literalType('directive'),
              },
              {
                name: 'hydration',
                type: {
                  type: 'record',
                  name: 'HydrationMetadata',
                  fields: [
                    {
                      name: 'directive',
                      type: 'string',
                    },
                    {
                      name: 'value',
                      type: 'string',
                    },
                    {
                      name: 'componentUrl',
                      type: 'string',
                    },
                    {
                      name: 'componentExport',
                      type: {
                        type: 'record',
                        name: 'ComponentExport',
                        fields: [{
                          name: 'value',
                          type: 'string',
                        }],
                      },
                    },
                  ],
                },
              },
            ],
          },
          {
            type: 'record',
            name: 'RenderHeadInstruction',
            fields: [{
              name: 'type',
              type: literalType('head'),
            }],
          },
          {
            type: 'record',
            name: 'MaybeRenderHeadInstruction',
            fields: [{
              name: 'type',
              type: literalType('maybe-head'),
            }],
          },
        ],
      },
    ],
  },
  {
    type: 'record',
    name: 'SerializedSlotString',
    fields: [
      {
        name: 'type',
        type: literalType('slotString'),
      },
      {
        name: 'instruction',
        type: [
          'RenderDirectiveInstruction',
          'RenderHeadInstruction',
          'MaybeRenderHeadInstruction',
        ],
      }
    ],
  },
  {
    type: 'record',
    name: 'SerializedArrayBufferView',
    fields: [
      {
        name: 'type',
        type: literalType('arrayBufferView'),
      },
      {
        name: 'value',
        type: 'bytes'
      },
    ],
  },
  {
    type: 'record',
    name: 'SerializedResponse',
    fields: [
      {
        name: 'type',
        type: literalType('response'),
      },
      {
        name: 'body',
        type: 'string',
      },
      {
        name: 'status',
        type: 'int',
      },
      {
        name: 'statusText',
        type: 'string',
      },
      {
        name: 'headers',
        type: {
          type: 'map',
          values: 'string'
        },
      },
    ]
  }
];

const serializedValueAvro = avsc.Type.forSchema([
  {
    type: 'record',
    name: 'SerializedTemplateResult',
    fields: [
      {
        name: 'type',
        type: literalType('templateResult'),
      },
      {
        name: 'chunks',
        type: {
          type: 'array',
          items: serializedChunksAvro,
        },
      }
    ],
  },
  {
    type: 'record',
    name: 'SerializedTemplateResult',
    fields: [
      {
        name: 'type',
        type: literalType('headAndContent'),
      },
      {
        name: 'head',
        type: 'string',
      },
      {
        name: 'chunks',
        type: {
          type: 'array',
          items: serializedChunksAvro,
        },
      }],
  },
  serializedChunksAvro.at(-1)!,
], {
  logicalTypes,
  wrapUnions: (types) => {
    if (!types.every(typ => (
      typ instanceof avsc.types.RecordType
      && typ.fields[0]?.type instanceof avsc.types.EnumType
      && typ.fields[0].type.symbols.length === 1
    ))) return;

    debugger;

    // Discriminated union
    const discriminators = types.map(
      typ => (
        (typ as avsc.types.RecordType).fields[0]!
          .type as avsc.types.EnumType
      ).symbols[0]!
    );

    return (val) => discriminators.indexOf(val);
  },
})

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

const serializedMetadataAvro = avsc.Type.forSchema({
  type: 'record',
  name: 'SerializedMetadata',
  fields: [
    {
      name: 'assetServiceCalls',
      type: {
        type: 'array',
        items: {
          type: 'record',
          name: 'AssetServiceCalls',
          fields: [
            {
              name: 'options',
              type: commonTypes.innerJson,
            },
            {
              name: 'resultingAttributes',
              type: {
                type: 'map',
                values: commonTypes.primitive,
              },
            },
          ],
        }
      },
    },
    {
      name: 'renderEntryCalls',
      type: {
        type: 'array',
        items: {
          type: 'record',
          name: 'RenderEntryCalls',
          fields: [
            {
              name: 'id',
              type: 'string',
            },
            {
              name: 'filePath',
              type: 'string',
            },
            {
              name: 'hash',
              type: 'string',
            },
          ],
        }
      },
    },
    {
      name: 'nestedComponents',
      type: {
        type: 'map',
        values: 'string',
      },
    },
    {
      name: 'metadata',
      type: {
        type: 'record',
        name: 'SSRMetadata',
        fields: [
          {
            name: 'hasHydrationScript',
            type: 'boolean'
          },
          {
            name: 'rendererSpecificHydrationScripts',
            type: commonTypes.stringArray,
          },
          {
            name: 'renderedScripts',
            type: commonTypes.stringArray,
          },
          {
            name: 'hasDirectives',
            type: commonTypes.stringArray,
          },
          {
            name: 'hasRenderedHead',
            type: 'boolean'
          },
          {
            name: 'headInTree',
            type: 'boolean'
          },
          {
            name: 'extraHead',
            type: {
              type: 'array',
              items: commonTypes.htmlString,
            }
          },
        ],
      }
    }
  ]
}, { logicalTypes });

const debug = rootDebug.extend('file-store');

type ValueThunk = Thunk<AstroFactoryReturnValue>;

export class RenderFileStore {
  private readonly gzippedCache = new MemoryCache<Buffer>(Number.POSITIVE_INFINITY);

  private readonly resolver: ReturnType<typeof createResolver>['resolve'];

  private knownFiles!: string[];

  public constructor(private readonly cacheDir: string) {
    this.resolver = createResolver(this.cacheDir).resolve;
    fs.mkdirSync(this.cacheDir, { recursive: true });
  }

  public async initialize() {
    if (fs.existsSync(this.cacheDir)) {
      this.knownFiles = await fs.promises.readdir(this.cacheDir, {
        recursive: true,
        withFileTypes: false,
      });
    } else {
      this.knownFiles = [];
    }

    await Promise.all(this.knownFiles.map(async hash => {
      try {
        const stored = await fs.promises.readFile(this.resolver(hash));
        this.gzippedCache.storeSync(hash, stored);
      } catch { }
    }))
  }

  public async saveRenderValue(key: string, value: AstroFactoryReturnValue): Promise<ValueThunk> {
    debug('Persisting renderer for ', key);
    const { denormalized, clone } = await RenderFileStore.denormalizeValue(value);

    if (denormalized) {
      this.store(key + ':renderer', serializedValueAvro.toBuffer(denormalized));
    }

    return clone;
  }

  public async loadRenderer(key: string): Promise<ValueThunk | null> {
    try {
      const storedBuf = await this.load(key + ':renderer');
      if (!storedBuf) {
        debug('Renderer cache miss', key);
        return null;
      }

      const serializedValue: SerializedValue = serializedValueAvro.fromBuffer(storedBuf);

      debug('Renderer cache hit', key);
      fsCacheHit();

      return RenderFileStore.normalizeValue(serializedValue);
    } catch {
      debug('Renderer cache miss', key);
      fsCacheMiss();
      return null;
    }
  }

  public saveMetadata(key: string, metadata: PersistedMetadata): void {
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

    this.store(key + ':metadata', serializedMetadataAvro.toBuffer(serialized));
  }

  public async loadMetadata(key: string): Promise<PersistedMetadata | null> {
    try {
      const storedBuf = await this.load(key + ':metadata', false);
      if (!storedBuf) {
        debug('Metadata cache miss', key);
        return null;
      }

      const serializedValue: SerializedMetadata = serializedMetadataAvro.fromBuffer(storedBuf);

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

  public store(cacheKey: string, data: any): void {
    setTimeout(async () => {
      try {
        const serializedData = Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data), 'utf-8');
        trackStoredData(serializedData.byteLength);
        const compressedData = await gzip(serializedData, { level: 9 });
        trackStoredCompressedData(compressedData.byteLength);

        const hash = murmurHash.murmurHash64(cacheKey);
        this.gzippedCache.storeSync(hash, compressedData);
        await fs.promises.writeFile(
          this.resolver(hash),
          compressedData,
        );
      } catch (err) {
        debug('Failed to persist data', err);
      }
    });
  }

  public async load(cacheKey: string, parse = true): Promise<any> {
    const hash = murmurHash.murmurHash64(cacheKey);
    if (!this.knownFiles.includes(hash)) return null;

    const storedData = await this.gzippedCache.load(
      hash,
      async () => await fs.promises.readFile(this.resolver(hash)),
    );
    trackLoadedCompressedData(storedData.byteLength);
    const uncompressedData = await gunzip(storedData);
    trackLoadedData(uncompressedData.byteLength);

    return parse ? JSON.parse(uncompressedData.toString('utf-8')) : uncompressedData;
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
      value: Buffer.from(chunk),
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
      )),
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
        return new runtime.HTMLBytes(chunk.value);
      case "slotString":
        return new runtime.SlotString(
          chunk.value,
          chunk.renderInstructions
            ?.map(RenderFileStore.normalizeRenderInstruction) ?? null,
        );
      case "renderInstruction":
        return RenderFileStore.normalizeRenderInstruction(chunk.instruction);
      case "arrayBufferView": {
        const buffer = chunk.value;
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
