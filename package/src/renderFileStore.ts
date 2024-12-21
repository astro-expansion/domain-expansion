import { createResolver } from "astro-integration-kit";
import type { RenderDestination, RenderDestinationChunk } from "astro/runtime/server/render/common.js";
import { rootDebug } from "./debug.ts";
import type { HTMLBytes, HTMLString, RenderInstruction } from "astro/runtime/server/index.js";
import type { SlotString } from "astro/runtime/server/render/slot.js";
import { readFile, writeFile } from "fs/promises";
import { mkdirSync } from "fs";
import type { AstroFactoryReturnValue } from "astro/runtime/server/render/astro/factory.js";
import type { createHeadAndContent, isHeadAndContent } from "astro/runtime/server/render/astro/head-and-content.js";
import type { isRenderTemplateResult, renderTemplate, RenderTemplateResult } from "astro/runtime/server/render/astro/render-template.js";
import { Either } from "./either.ts";

type RuntimeInstances = {
  HTMLBytes: typeof HTMLBytes,
  HTMLString: typeof HTMLString,
  SlotString: typeof SlotString,
  createHeadAndContent: typeof createHeadAndContent,
  isHeadAndContent: typeof isHeadAndContent,
  renderTemplate: typeof renderTemplate,
  isRenderTemplateResult: typeof isRenderTemplateResult,
}

const runtime: RuntimeInstances = ((globalThis as any)[Symbol.for('@domain-expansion:astro-runtime-instances')] = {} as RuntimeInstances);

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

export type ValueThunk = () => AstroFactoryReturnValue;

const debug = rootDebug.extend('file-store');

export class RenderFileStore {
  private readonly resolver: ReturnType<typeof createResolver>['resolve'];

  public constructor(cacheDir: string) {
    mkdirSync(cacheDir, { recursive: true });
    this.resolver = createResolver(cacheDir).resolve;
  }

  public async persistValue(key: string, value: AstroFactoryReturnValue): Promise<ValueThunk> {
    const { denormalized, clone } = await RenderFileStore.denormalizeValue(value);

    if (denormalized) {
      await writeFile(
        this.resolver(key),
        JSON.stringify(
          denormalized,
          null,
          2
        ),
        'utf-8'
      );
    }

    return clone;
  }

  public async loadRenderer(key: string): Promise<ValueThunk | null> {
    try {
      const serializedValue: SerializedValue = JSON.parse(await readFile(this.resolver(key), 'utf-8'));

      console.count('domain-expansion:cache-hit');
      debug('Cache hit', key);

      return RenderFileStore.normalizeValue(serializedValue);
    } catch {
      console.count('domain-expansion:cache-miss');
      debug('Cache miss', key);
      return null;
    }
  }

  private static async denormalizeValue(value: AstroFactoryReturnValue): Promise<{ denormalized?: SerializedValue, clone: ValueThunk }> {
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
      const clone = () => RenderFileStore.renderTemplateFromSeminormalizedChunks(seminormalChunks);

      return seminormalChunks.every(Either.isRight)
        ? {
          clone,
          denormalized: {
            type: 'headAndContent',
            head: value.head,
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
        return () => runtime.createHeadAndContent(value.head, RenderFileStore.renderTemplateFromSeminormalizedChunks(seminormalChunks));
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
        return new runtime.SlotString(chunk.value, chunk.renderInstructions ?? null);
      case "renderInstruction":
        return chunk.instruction;
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
        for (const chunk of chunks) {
          if (Either.isLeft(chunk)) {
            destination.write(chunk.value);
          } else {
            destination.write(RenderFileStore.normalizeChunk(chunk.value));
          }
        }
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
