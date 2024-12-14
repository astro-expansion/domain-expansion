import type * as Runtime from "astro/compiler-runtime";
import hashSum from "hash-sum";
import { Cache } from "./cache.ts";
import { rootDebug } from "./debug.ts";
import { RenderTemplateResult } from "astro/runtime/server/render/astro/render-template.js";

type CacheableFns = {
  render: typeof Runtime.render,
  renderComponent: typeof Runtime.renderComponent | undefined,
}

type CacheRenderingFn = (meta: { scope: string, id: string }, fns: CacheableFns) => CacheableFns;

const debug = rootDebug.extend('render-caching');

export const makeCaching = (cache: Cache, routeEntrypoints: string[]): CacheRenderingFn => ({ scope, id }, fns) => {
  debug('Render caching called with:', { scope, id, routeEntrypoints });

  return {
    render: (template, ...rawExpressions) => {
      if (!routeEntrypoints.includes(id)) return fns.render(template, ...rawExpressions);

      const cachedRenderer = cache.getRenderer(scope, async () => {
        const expressions = await Promise.all(rawExpressions);
        const hash = hashSum([scope, template, expressions]);
        debug('$render called with', {
          scope, hash,
        });

        return {
          key: hash,
          loadFresh: () => {
            const freshRenderResult = fns.render(template, ...expressions);

            return Object.assign(freshRenderResult, { scope });
          },
        };
      });

      const templateResult = new RenderTemplateResult(template, rawExpressions);

      Object.defineProperty(templateResult, 'render', {
        value: cachedRenderer.render,
      });

      return templateResult;
    },
    renderComponent: fns.renderComponent
      ? (result, displayName, component, props, slots) => Promise.resolve(cache.getRenderer(scope, async () => {
        const resolvedProps = Object.fromEntries(await Promise.all(
          Object.entries(props)
            .map(async ([key, value]) => [key, await value])
        ));

        // We need to delete this because otherwise scopes from outside of a component can be globally
        // restricted to the inside of a child component through a slot and to support that the component
        // has to depend on its parent. Don't do that.
        //
        // This is required because this block in Astro doesn't return the `transformResult.scope`:
        // https://github.com/withastro/astro/blob/799c8676dfba0d281faf2a3f2d9513518b57593b/packages/astro/src/vite-plugin-astro/index.ts?plain=1#L246-L257
        const scopeProp = Object.keys(resolvedProps).find(prop => prop.startsWith('data-astro-cid-'));
        if (scopeProp !== undefined) {
          delete resolvedProps[scopeProp];
        }

        if (slots === undefined) {
          const hash = hashSum([component, resolvedProps]);

          return {
            key: hash,
            loadFresh: () => fns.renderComponent!(result, displayName, component, props)
          };
        }

        const hash = hashSum([scope, component, resolvedProps]);

        return {
          key: hash,
          loadFresh: () => fns.renderComponent!(result, displayName, component, props, slots),
        };
      }))
      : undefined,
  };
}
