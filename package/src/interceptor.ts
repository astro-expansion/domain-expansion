import type { Plugin } from 'vite';
import type { AstNode, TransformPluginContext } from 'rollup';
import { walk, type Node as ETreeNode } from 'estree-walker';
import { rootDebug } from './debug.js';
import { AstroError } from 'astro/errors';
import { makeCaching } from './renderCaching.js';
import { Cache } from './cache.js';
import { createResolver } from 'astro-integration-kit';
import type { AstroConfig } from 'astro';
import MagicString, { type SourceMap } from 'magic-string';
import assert from 'assert';

const debug = rootDebug.extend('interceptor-plugin');

const MODULE_ID = 'virtual:domain-expansion';
const RESOLVED_MODULE_ID = '\x00virtual:domain-expansion';

export const interceptorPlugin = (_astroConfig: AstroConfig, routeEntrypoints: string[]): Plugin => {
  return {
    name: '@domain-expansion/interceptor',
    enforce: 'post',
    configResolved(config) {
      const { resolve: resolver } = createResolver(config.root);

      (globalThis as any)[Symbol.for('@domain-expansion:astro-component-caching')] = makeCaching(
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
import { getImage } from "astro/assets";

Object.assign(globalThis[Symbol.for('@domain-expansion:astro-runtime-instances')] ?? {}, {
  HTMLBytes,
  HTMLString,
  SlotString,
  createHeadAndContent,
  isHeadAndContent,
  renderTemplate,
  isRenderTemplateResult,
  createRenderInstruction,
  getImage,
});

const compCacheSym = Symbol.for('@domain-expansion:astro-component-caching');
export const domainExpansionComponents = globalThis[compCacheSym] ?? ((fn) => fn);

const assetTrackingSym = Symbol.for('@domain-expansion:astro-asset-tracking');
export const domainExpansionAssets = globalThis[assetTrackingSym] ?? ((fn) => fn);
`;
    },
    async transform(code, id, { ssr } = {}) {
      if (!ssr) return;

      const transformers: Transformer[] = [
        createComponentTransformer,
        getImageAssetTransformer,
      ];

      for (const transformer of transformers) {
        const result = transformer(this, code, id);
        if (result) return result;
      }

      return;
    },
  }
}

type Transformer = (ctx: TransformPluginContext, code: string, id: string) => TransformResult | null;

type TransformResult = {
  code: string,
  map: SourceMap,
}

const createComponentTransformer: Transformer = (ctx, code, id) => {
  if (!code.includes('function createComponent(')) return null;

  if (!/node_modules\/astro\/dist\/runtime\/[\w\/.-]+\.js/.test(id)) {
    debug('"createComponent" declaration outside of expected module', { id });
  }

  const ms = new MagicString(code);
  const ast = ctx.parse(code);

  walk(ast, {
    leave(estreeNode, parent) {
      const node = estreeNode as ETreeNode & AstNode;
      if (node.type !== 'FunctionDeclaration') return;
      if (node.id.name !== 'createComponent') return;
      if (parent?.type !== 'Program') {
        throw new Error('Astro core has changed its runtime, "@domain-expansion/astro" is not compatible with the currently installed Astro version.');
      }

      ms.prependLeft(node.start, [
        `import {domainExpansionComponents as $$domainExpansion} from ${JSON.stringify(MODULE_ID)};`,
        'const createComponent = $$domainExpansion(',
      ].join('\n'));
      ms.appendRight(node.end, ');');
    }
  });

  return {
    code: ms.toString(),
    map: ms.generateMap(),
  };
}

const getImageAssetTransformer: Transformer = (ctx, code, id) => {
  if (id !== '\0astro:assets') return null;

  const ms = new MagicString(code);
  const ast = ctx.parse(code);

  let path: Array<ETreeNode & AstNode> = [];

  walk(ast, {
    enter(estreeNode) {
      const node = estreeNode as ETreeNode & AstNode;
      path.push(node);
      if (node.type !== 'VariableDeclarator') return;
      if (node.id.type !== 'Identifier') return;
      if (node.id.name !== 'getImage') return;
      if (!node.init) return;

      const namedExport = path[1];
      assert.ok(
        namedExport?.type === 'ExportNamedDeclaration',
        'broken node path, Astro changed astro:assets. Run to the hills.',
      );

      ms.appendLeft(
        namedExport.start,
        `import {domainExpansionAssets as $$domainExpansion} from ${JSON.stringify(MODULE_ID)};\n`,
      );
      ms.appendLeft(
        (node.init as ETreeNode & AstNode).start,
        '$$domainExpansion(',
      );
      ms.prependRight((node.init as ETreeNode & AstNode).end, ')');
    },
    leave(estreeNode) {
      const last = path.pop();

      assert.ok(Object.is(estreeNode, last), 'path tracking failed');
    },
  });

  return {
    code: ms.toString(),
    map: ms.generateMap(),
  };
}

