import type { Plugin } from 'vite';
import { rootDebug } from './debug.ts';
import { AstroError } from 'astro/errors';
import MagicString from 'magic-string';
import { makeCaching } from './renderCaching.ts';
import { Cache } from './cache.ts';
import { createResolver } from 'astro-integration-kit';
import hash_sum from 'hash-sum';

const debug = rootDebug.extend('interceptor-plugin');
const SEARCH_STR = 'from "astro/compiler-runtime";\n';

const MODULE_ID = 'virtual:domain-expansion';
const RESOLVED_MODULE_ID = '\x00virtual:domain-expansion';

const sym = Symbol.for('@domain-expansion:astro');

export const interceptorPlugin = (): Plugin => {
  return {
    name: '@domain-expansion/interceptor',
    enforce: 'post',
    configResolved(config) {
      const { resolve: resolver } = createResolver(config.root);

      (globalThis as any)[sym] = makeCaching(new Cache(resolver('node_modules/.astro-cache')));
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
const sym = Symbol.for('@domain-expansion:astro');
export const domainExpansion = globalThis[sym] ?? ((_, fns) => fns);
`;
    },
    transform(code, id, { ssr } = {}) {
      if (!ssr) return;
      if (!id.endsWith('.astro')) return;

      debug('Transforming:', id);

      const ms = new MagicString(code);

      const endOfImport = code.indexOf(SEARCH_STR);
      const hash = hash_sum(code);

      if (code.includes('renderComponent as $$renderComponent')) {
        ms.appendRight(endOfImport + SEARCH_STR.length, `
import {domainExpansion as $$domainExpansion} from "${MODULE_ID}";
const {render: $$render, renderComponent: $$renderComponent} = $$domainExpansion(${JSON.stringify(hash)}, {
  render: $$render_original,
  renderComponent: $$renderComponent_original,
});
`);
        ms.replace('renderComponent as $$renderComponent', 'renderComponent as $$renderComponent_original');
      } else {
        ms.appendRight(endOfImport + SEARCH_STR.length, `
import {domainExpansion as $$domainExpansion} from "${MODULE_ID}";
const {render: $$render} = $$domainExpansion(${JSON.stringify(hash)}, {
  render: $$render_original,
});
`);
      }

      ms.replace('render as $$render', 'render as $$render_original');

      return {
        code: ms.toString(),
        map: ms.generateMap(),
      };
    }
  }
}
