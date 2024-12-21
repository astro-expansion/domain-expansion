import type { Plugin } from 'vite';
import type { AstNode } from 'rollup';
import { walk, type Node as ETreeNode } from 'estree-walker';
import { rootDebug } from './debug.ts';
import { AstroError } from 'astro/errors';
import { makeCaching } from './renderCaching.ts';
import { Cache } from './cache.ts';
import { createResolver } from 'astro-integration-kit';
import type { AstroConfig } from 'astro';
import MagicString from 'magic-string';

const debug = rootDebug.extend('interceptor-plugin');

const MODULE_ID = 'virtual:domain-expansion';
const RESOLVED_MODULE_ID = '\x00virtual:domain-expansion';

const sym = Symbol.for('@domain-expansion:astro');

export const interceptorPlugin = (_astroConfig: AstroConfig, routeEntrypoints: string[]): Plugin => {
  return {
    name: '@domain-expansion/interceptor',
    enforce: 'post',
    configResolved(config) {
      const { resolve: resolver } = createResolver(config.root);

      (globalThis as any)[sym] = makeCaching(
        new Cache(resolver('node_modules/.domain-expansion')),
        config.root,
        routeEntrypoints.map(entrypoint => resolver(entrypoint)),
      );
    },
    resolveId(id) {
      if (id === MODULE_ID) return RESOLVED_MODULE_ID;

      return null;
    },
    load(id, { ssr } = {}) {
      if (id !== RESOLVED_MODULE_ID) return;
      if (!ssr) throw new AstroError("Client domain can't be expanded.");

      // Return unchanged functions when not in a shared context with the build pipeline
      // AKA. During server rendering
      return `
import { HTMLBytes, HTMLString } from "astro/runtime/server/index.js";
import { SlotString } from "astro/runtime/server/render/slot.js";
import { createHeadAndContent, isHeadAndContent } from "astro/runtime/server/render/astro/head-and-content.js";
import { isRenderTemplateResult, renderTemplate } from "astro/runtime/server/render/astro/render-template.js";
import { createRenderInstruction } from "astro/runtime/server/render/instruction.js";

Object.assign(globalThis[Symbol.for('@domain-expansion:astro-runtime-instances')] ?? {}, {
  HTMLBytes: HTMLBytes,
  HTMLString: HTMLString,
  SlotString: SlotString,
  createHeadAndContent: createHeadAndContent,
  isHeadAndContent: isHeadAndContent,
  renderTemplate: renderTemplate,
  isRenderTemplateResult: isRenderTemplateResult,
  createRenderInstruction: createRenderInstruction,
});

const sym = Symbol.for('@domain-expansion:astro');
export const domainExpansion = globalThis[sym] ?? ((fn) => fn);
`;
    },
    async transform(code, id, { ssr } = {}) {
      if (!ssr) return;
      if (!code.includes('function createComponent(')) return;

      if (!/node_modules\/astro\/dist\/runtime\/[\w\/.-]+\.js/.test(id)) {
        debug('"createComponent" declaration outside of expected module', { id });
      }

      const ms = new MagicString(code);
      const ast = this.parse(code);

      walk(ast, {
        leave(estreeNode, parent) {
          const node = estreeNode as ETreeNode & AstNode;
          if (node.type !== 'FunctionDeclaration') return;
          if (node.id.name !== 'createComponent') return;
          if (parent?.type !== 'Program') {
            throw new Error('Astro core has changed its runtime, "@domain-expansion/astro" is not compatible with the currently installed Astro version.');
          }

          ms.prependLeft(node.start, [
            `import {domainExpansion as $$domainExpansion} from ${JSON.stringify(MODULE_ID)};`,
            'const createComponent = $$domainExpansion(',
          ].join('\n'));
          ms.appendRight(node.end, ');');
        }
      });

      return {
        code: ms.toString(),
        map: ms.generateMap(),
      };
    },
  }
}
