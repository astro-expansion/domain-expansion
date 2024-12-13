import type { Plugin } from 'vite';
import { rootDebug } from './debug.ts';
import { AstroError } from 'astro/errors';
import MagicString from 'magic-string';
import { makeCaching } from './renderCaching.ts';

const debug = rootDebug.extend('interceptor-plugin');
const SEARCH_STR = 'from "astro/compiler-runtime";\n';

const MODULE_ID = 'virtual:domain-expansion';
const RESOLVED_MODULE_ID = '\x00virtual:domain-expansion';

const sym = Symbol.for('@domain-expansion:astro');
(globalThis as any)[sym] = makeCaching;

export const interceptorPlugin = (): Plugin => {
  return {
    name: '@domain-expansion/interceptor',
    enforce: 'post',
    resolveId(id) {
      if (id === MODULE_ID) return RESOLVED_MODULE_ID;

      return null;
    },
    load(id, { ssr } = {}) {
      if (id !== RESOLVED_MODULE_ID) return;
      if (!ssr) throw new AstroError("Client domain can't be expanded.");

      return `
const sym = Symbol.for('@domain-expansion:astro');
export const domainExpansion = globalThis[sym]
  ?? ((_, render, renderComponent) => ({render, renderComponent}));
`;
    },
    transform(code, id, { ssr } = {}) {
      if (!ssr) return;
      if (!id.endsWith('.astro')) return;

      debug('Transforming:', id);

      const ms = new MagicString(code);

      const endOfImport = code.indexOf(SEARCH_STR);

      if (code.includes('renderComponent as $$renderComponent')) {
        // TODO: Pass in the hash instead of the ID
        ms.appendRight(endOfImport + SEARCH_STR.length, `
import {domainExpansion as $$domainExpansion} from "${MODULE_ID}";
const {render: $$render, renderComponent: $$renderComponent} = $$domainExpansion(${JSON.stringify(id)}, $$render_original, $$renderComponent_original);
`);
        ms.replace('renderComponent as $$renderComponent', 'renderComponent as $$renderComponent_original');
      } else {
        ms.appendRight(endOfImport + SEARCH_STR.length, `
import {domainExpansion as $$domainExpansion} from "${MODULE_ID}";
const {render: $$render} = $$domainExpansion(${JSON.stringify(id)}, $$render_original);
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
