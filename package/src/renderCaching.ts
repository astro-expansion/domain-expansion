import type * as Runtime from "astro/compiler-runtime";
import hashSum from "hash-sum";
import { Cache } from "./cache.ts";
import { rootDebug } from "./debug.ts";

type CacheableFns = {
  render: typeof Runtime.render,
  renderComponent: typeof Runtime.renderComponent | undefined,
}

type CacheRenderingFn = (parentHash: string, fns: CacheableFns) => CacheableFns;

const debug = rootDebug.extend('render-caching');

export const makeCaching = (cache: Cache): CacheRenderingFn => (parentHash, fns) => {
  debug('Render caching called with parent hash:', parentHash);

  return {
    render: async (template, ...rawExpressions) => {
      const expressions = await Promise.all(rawExpressions);
      const hash = hashSum([parentHash, template, expressions]);
      // debug('$render called with', { template, expressions, hash })

      return fns.render(template, ...expressions);
    },
    renderComponent: fns.renderComponent
      ? async (result, displayName, component, props, slots) => {
        const resolvedProps = Object.fromEntries(await Promise.all(
          Object.entries(props)
            .map(async ([key, value]) => [key, await value]),
        ));

        if (slots === undefined) {
          const hash = hashSum([component, resolvedProps]);
          debug('$renderComponent called without children', { displayName, resolvedProps, hash });

          return fns.renderComponent!(result, displayName, component, props);
        }

        const hash = hashSum([parentHash, component, resolvedProps]);
        debug('$renderComponent called with children', { displayName, resolvedProps, hash });

        return fns.renderComponent!(result, displayName, component, props, slots);
      }
      : undefined,
  };
}
