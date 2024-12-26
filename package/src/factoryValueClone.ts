import type { RenderTemplateResult } from "astro/runtime/server/render/astro/render-template.js";
import { runtime, type Thunk } from "./utils.ts";
import type { RenderDestination, RenderDestinationChunk } from "astro/runtime/server/render/common.js";
import type { HeadAndContent } from "astro/runtime/server/render/astro/head-and-content.js";
import type { AstroFactoryReturnValue } from "astro/runtime/server/render/astro/factory.js";

export namespace FactoryValueClone {
  export function makeResultClone(
    value: AstroFactoryReturnValue
  ): Promise<Thunk<AstroFactoryReturnValue>> {
    if (value instanceof Response) {
      return makeResponseClone(value);
    }

    if (runtime.isHeadAndContent(value)) {
      return makeHeadAndContentClone(value);
    }

    return makeRenderTemplateClone(value);
  }

  export async function makeResponseClone(value: Response): Promise<Thunk<Response>> {
    const body = await value.arrayBuffer();
    return () => new Response(body, value);
  }

  export async function makeRenderTemplateClone(
    value: RenderTemplateResult
  ): Promise<Thunk<RenderTemplateResult>> {
    const chunks = await renderTemplateToChunks(value);
    return () => renderTemplateFromChunks(chunks);
  }

  export async function makeHeadAndContentClone(
    value: HeadAndContent,
  ): Promise<Thunk<HeadAndContent>> {
    const chunks = await renderTemplateToChunks(value.content);
    return () => runtime.createHeadAndContent(value.head, renderTemplateFromChunks(chunks));
  }

  export function renderTemplateFromChunks(
    chunks: RenderDestinationChunk[]
  ): RenderTemplateResult {
    const template = runtime.renderTemplate(Object.assign([], { raw: [] }));

    return Object.assign(template, {
      render: (destination: RenderDestination) => {
        return new Promise<void>(resolve => {
          setImmediate(() => {
            for (const chunk of chunks) {
              destination.write(chunk);
            }

            resolve();
          });
        });
      }
    })
  }

  export async function renderTemplateToChunks(value: RenderTemplateResult): Promise<RenderDestinationChunk[]> {
    const chunks: RenderDestinationChunk[] = [];

    const cachedDestination: RenderDestination = {
      write(chunk) {
        // Drop empty chunks
        if (chunk) chunks.push(chunk);
      },
    };

    await value.render(cachedDestination);

    return chunks;
  }
}
