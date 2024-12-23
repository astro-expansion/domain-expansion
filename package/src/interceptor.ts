import type { Plugin } from 'vite';
import type { AstNode, TransformPluginContext } from 'rollup';
import { walk, type Node as ETreeNode } from 'estree-walker';
import { rootDebug } from './debug.js';
import { AstroError } from 'astro/errors';
import { makeCaching } from './renderCaching.js';
import { Cache } from './cache.js';
import { createResolver } from 'astro-integration-kit';
import MagicString, { type SourceMap } from 'magic-string';
import hash_sum from 'hash-sum';
import assert from 'node:assert';

const debug = rootDebug.extend('interceptor-plugin');

const MODULE_ID = 'virtual:domain-expansion';
const RESOLVED_MODULE_ID = '\x00virtual:domain-expansion';

const EXCLUDED_MODULE_IDS: string[] = [
  '\0astro:content',
  '\0astro:assets',
];

type ParseNode = ETreeNode & AstNode;

export const interceptorPlugin = (options: {
  cacheComponents: false | 'in-memory' | 'persistent',
  cachePages: boolean,
  routeEntrypoints: string[],
}): Plugin => {
  const componentHashes = new Map<string, string>();

  return {
    name: '@domain-expansion/interceptor',
    enforce: 'post',
    async configResolved(config) {
      const { resolve: resolver } = createResolver(config.root);

      const cache = new Cache(resolver('node_modules/.domain-expansion'));

      await cache.initialize();

      (globalThis as any)[Symbol.for('@domain-expansion:astro-component-caching')] = makeCaching({
        ...options,
        cache,
        root: config.root,
        routeEntrypoints: options.routeEntrypoints.map(entrypoint => resolver(entrypoint)),
        componentHashes,
      });
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
  HTMLBytes,
  HTMLString,
  SlotString,
  createHeadAndContent,
  isHeadAndContent,
  renderTemplate,
  isRenderTemplateResult,
  createRenderInstruction,
});

const compCacheSym = Symbol.for('@domain-expansion:astro-component-caching');
export const domainExpansionComponents = globalThis[compCacheSym] ?? ((fn) => fn);

const assetTrackingSym = Symbol.for('@domain-expansion:astro-asset-tracking');
export const domainExpansionAssets = globalThis[assetTrackingSym] ?? ((fn) => fn);

const ccRenderTrackingSym = Symbol.for('@domain-expansion:astro-cc-render-tracking');
export const domainExpansionRenderEntry = globalThis[ccRenderTrackingSym] ?? ((fn) => fn);
`;
    },
    async transform(code, id, { ssr } = {}) {
      if (!ssr) return;

      const transformers: Transformer[] = [
        createComponentTransformer,
        getImageAssetTransformer,
        renderCCEntryTransformer,
      ];

      for (const transformer of transformers) {
        const result = transformer(this, code, id);
        if (result) return result;
      }

      return;
    },
    async generateBundle() {
      for (const rootName of this.getModuleIds()) {
        if (!rootName.endsWith('.astro')) continue;

        const processedImports: string[] = [];
        const hashParts: string[] = [];
        const importQueue = [rootName];

        while (importQueue.length) {
          const modName = importQueue.pop()!;
          const modInfo = this.getModuleInfo(modName)!;
          if (modInfo.isExternal || !modInfo.code) continue;

          processedImports.push(modName);
          hashParts.push(modInfo.code);
          importQueue.push(...modInfo.importedIdResolutions
            .map(resolution => resolution.id)
            .filter(
              importId => (
                !importId.endsWith('.astro')
                && !EXCLUDED_MODULE_IDS.includes(importId)
                && !processedImports.includes(importId)
              )
            ));
        }

        componentHashes.set(rootName, hash_sum(hashParts));
      }
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
    return null;
  }

  const ms = new MagicString(code);
  const ast = ctx.parse(code);

  walk(ast, {
    leave(estreeNode, parent) {
      const node = estreeNode as ParseNode;
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

  const path: ParseNode[] = [];

  walk(ast, {
    enter(estreeNode) {
      const node = estreeNode as ParseNode;
      path.push(node);
      if (
        node.type !== 'VariableDeclarator'
        || node.id.type !== 'Identifier'
        || node.id.name !== 'getImage'
      ) return;
      const exportDeclaration = path.at(-3);
      assert.ok(isParseNode(node.init));
      assert.ok(
        exportDeclaration?.type === 'ExportNamedDeclaration',
        'Astro core has changed its runtime, "@domain-expansion/astro" is not compatible with the currently installed Astro version.',
      );

      ms.prependLeft(
        exportDeclaration.start,
        `import {domainExpansionAssets as $$domainExpansion} from ${JSON.stringify(MODULE_ID)};\n`,
      );
      ms.prependLeft(node.init.start, '$$domainExpansion(');
      ms.appendRight(node.init.end, ')');
    },
    leave(estreeNode) {
      const lastNode = path.pop();
      assert.ok(Object.is(lastNode, estreeNode), 'Stack tracking broke');
    },
  });

  return {
    code: ms.toString(),
    map: ms.generateMap(),
  };
}

const renderCCEntryTransformer: Transformer = (ctx, code, id) => {
  if (!code.includes('function renderEntry(')) return null;

  if (!/node_modules\/astro\/dist\/content\/[\w\/.-]+\.js/.test(id)) {
    debug('"renderEntry" declaration outside of expected module', { id });
    return null;
  }

  const ms = new MagicString(code);
  const ast = ctx.parse(code);

  walk(ast, {
    enter(estreeNode, parent) {
      const node = estreeNode as ParseNode;
      if (node.type !== 'FunctionDeclaration') return;
      if (node.id.name !== 'renderEntry') return;
      if (parent?.type !== 'Program') {
        throw new Error('Astro core has changed its runtime, "@domain-expansion/astro" is not compatible with the currently installed Astro version.');
      }

      ms.prependLeft(node.start, [
        `import {domainExpansionRenderEntry as $$domainExpansion} from ${JSON.stringify(MODULE_ID)};\n`,
        'const renderEntry = $$domainExpansion(',
      ].join('\n'));
      ms.appendRight(node.end, ');');
    },
  });

  return {
    code: ms.toString(),
    map: ms.generateMap(),
  };
}

function isParseNode(node?: ETreeNode | null): node is ParseNode {
  return node != null && 'start' in node && typeof node.start === 'number';
}
