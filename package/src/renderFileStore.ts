import { createResolver } from "astro-integration-kit";
import type { RenderDestinationChunk } from "astro/runtime/server/render/common.js";
import { rootDebug } from "./debug.ts";
import { HTMLBytes, HTMLString, type RenderInstruction } from "astro/runtime/server/index.js";
import { SlotString } from "astro/runtime/server/render/slot.js";
import { readFile, writeFile } from "fs/promises";
import { mkdirSync, rmSync } from "fs";

const NON_SERIALIZABLE_RENDER_INSTRUCTIONS = [
  'renderer-hydration-script',
] satisfies Array<RenderInstruction['type']>;

type SerializableRenderInstruction = Exclude<RenderInstruction, {
  type: (typeof NON_SERIALIZABLE_RENDER_INSTRUCTIONS)[number]
}>;

type SerializationMap = {
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
    headers: Record<string, string>,
  },
}

type SerializedChunk<K extends keyof SerializationMap = keyof SerializationMap> = {
  [T in K]: SerializationMap[T] & { type: T }
}[K];

const debug = rootDebug.extend('file-store');

export class RenderFileStore {
  private readonly resolver: ReturnType<typeof createResolver>['resolve'];

  public constructor(cacheDir: string) {
    mkdirSync(cacheDir, { recursive: true });
    this.resolver = createResolver(cacheDir).resolve;
  }

  public async persistRenderer(key: string, scope: string, chunks: RenderDestinationChunk[]): Promise<void> {
    const denormalizedChunks = await Promise.all(chunks.map(RenderFileStore.denormalizeChunk));
    if (denormalizedChunks.includes(null)) return;

    await writeFile(
      this.resolver(key),
      JSON.stringify(
        { scope, chunks: denormalizedChunks },
        null,
        2
      ),
      'utf-8'
    );
  }

  public async loadRenderer(key: string): Promise<{ scope: string, chunks: RenderDestinationChunk[] } | null> {
    try {
      const { scope, chunks } = JSON.parse(await readFile(this.resolver(key), 'utf-8'));

      return { scope, chunks: chunks.map(RenderFileStore.normalizeChunk) }
    } catch {
      return null;
    }
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

    if (RenderFileStore.isInstanceByName<HTMLBytes>('HTMLBytes', chunk)) return {
      type: 'htmlBytes',
      value: Buffer.from(chunk).toString('base64'),
    };

    if (RenderFileStore.isInstanceByName<SlotString>('SlotString', chunk)) {
      const instructions = chunk.instructions?.filter(this.isSerializableRenderInstruction);

      // Some instruction was not serializable
      if (instructions?.length !== chunk.instructions?.length) return null;

      return {
        type: 'slotString',
        value: chunk.toString(),
        renderInstructions: instructions,
      };
    }


    if (RenderFileStore.isInstanceByName<HTMLString>('HTMLString', chunk)) return {
      type: 'htmlString',
      value: chunk.toString(),
    }

    if (chunk instanceof Response) {
      return {
        type: 'response',
        body: await chunk.text(),
        headers: Object.fromEntries(chunk.headers.entries()),
      }
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
        return new HTMLString(chunk.value);
      case "htmlBytes":
        return new HTMLBytes(Buffer.from(chunk.value, 'base64'));
      case "slotString":
        return new SlotString(chunk.value, chunk.renderInstructions ?? null);
      case "renderInstruction":
        return chunk.instruction;
      case "arrayBufferView": {
        const buffer = Buffer.from(chunk.value, 'base64');
        return {
          buffer,
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

  private static isSerializableRenderInstruction(
    instruction: RenderInstruction
  ): instruction is SerializableRenderInstruction {
    return !(NON_SERIALIZABLE_RENDER_INSTRUCTIONS as Array<RenderInstruction['type']>)
      .includes(instruction.type);
  }

  private static isInstanceByName<T>(name: string, chunk: any): chunk is T {
    return chunk.constructor.name === name;
  }
}
