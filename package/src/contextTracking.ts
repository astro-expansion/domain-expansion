import { AsyncLocalStorage } from "node:async_hooks";
import type { PersistedMetadata } from "./renderFileStore.js";
import { runtime } from "./utils.js";
import type { getImage } from "astro/assets";
import { rootDebug } from "./debug.js";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import type { renderEntry } from "astro/content/runtime";
import type { UnresolvedImageTransform } from "astro";
import { getSystemErrorName, types } from "node:util";

export type ContextTracking = {
  assetServiceCalls: Array<{
    options: UnresolvedImageTransform,
    config: Parameters<typeof getImage>[1],
    resultingAttributes: Record<string, any>,
  }>,
  renderEntryCalls: Array<{
    id: string,
    filePath: string,
    hash: string,
  }>,
  nestedComponents: Record<string, string>
  doNotCache: boolean,
  renderingEntry: boolean,
}

const debug = rootDebug.extend('context-tracking');
const contextTracking = new AsyncLocalStorage<ContextTracking>();

export function makeContextTracking(): {
  runIn: <T>(fn: () => T) => T,
  collect: () => ContextTracking,
} {
  debug('Initializing asset collector');
  const parent = contextTracking.getStore();
  const context: ContextTracking = {
    assetServiceCalls: [],
    renderEntryCalls: [],
    nestedComponents: {},
    doNotCache: false,
    renderingEntry: false,
  }

  return {
    runIn: <T>(fn: () => T): T => {
      return contextTracking.run(context, fn);
    },
    collect: () => {
      debug('Retrieving collected context', {
        assetCalls: context.assetServiceCalls.length,
        ccRenderCalls: context.renderEntryCalls.length,
        nestedComponents: Object.keys(context.nestedComponents),
      });

      if (parent) {
        parent.assetServiceCalls.push(...context.assetServiceCalls);
        parent.renderEntryCalls.push(...context.renderEntryCalls);
        Object.assign(parent.nestedComponents, context.nestedComponents);
        parent.doNotCache ||= context.doNotCache;
      }
      return context;
    },
  };
}

export function getCurrentContext(): ContextTracking | undefined {
  return contextTracking.getStore();
}

const assetTrackingSym = Symbol.for('@domain-expansion:astro-asset-tracking');
(globalThis as any)[assetTrackingSym] = (original: typeof getImage): typeof getImage => {
  runtime.getImage = original;
  debug('Wrapping getImage');
  return async (options, config) => {
    const result = await original(options, config);

    const context = contextTracking.getStore();
    if (context) {
      const val: PersistedMetadata['assetServiceCalls'][number] = {
        options, config,
        resultingAttributes: result.attributes,
      };
      debug('Collected getImage call', val);
      context.assetServiceCalls.push(val);
    }

    return result;
  }
};

export async function computeEntryHash(filePath: string): Promise<string> {
  try {
    return createHash('sha1').update(await fs.promises.readFile(filePath)).digest().toString('hex');
  } catch (err) {
    if (
      types.isNativeError(err)
      && 'errno' in err
      && typeof err.errno === 'number'
      && getSystemErrorName(err.errno) === 'ENOENT'
    ) {
      // Placeholder hash for entries attempting to render a missing file
      return '__NO_FILE__';
    }

    throw err;
  }
}

const ccRenderTrackingSym = Symbol.for('@domain-expansion:astro-cc-render-tracking');
(globalThis as any)[ccRenderTrackingSym] = (original: typeof renderEntry): typeof renderEntry => {
  runtime.renderEntry = original;
  debug('Wrapping renderEntry');
  return async (entry) => {
    const context = contextTracking.getStore();
    if (!context) return original(entry);

    if (!('id' in entry && entry.filePath)) {
      context.doNotCache = true;
      return original(entry);
    }

    const hash = await computeEntryHash(entry.filePath);

    const val: ContextTracking['renderEntryCalls'][number] = {
      id: entry.id,
      filePath: entry.filePath,
      hash,
    };
    debug('Collected renderEntry call', val);
    context.renderEntryCalls.push(val);

    context.renderingEntry = true;
    const result = await original(entry);
    context.renderingEntry = false;

    return result;
  }
};
