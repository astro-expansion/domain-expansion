import type { Plugin } from 'vite';
// import { compile } from "../node_modules/astro/dist/core/compile/index.js";
import { rootDebug } from './debug.ts';
import { AstroError } from 'astro/errors';
import MagicString from 'magic-string';
import { makeCaching } from './renderCaching.ts';
import { Cache } from './cache.ts';
import { createResolver } from 'astro-integration-kit';
import type { AstroConfig } from 'astro';

const debug = rootDebug.extend('interceptor-plugin');
const SEARCH_STR = 'from "astro/compiler-runtime";\n';

const MODULE_ID = 'virtual:domain-expansion';
const RESOLVED_MODULE_ID = '\x00virtual:domain-expansion';

const sym = Symbol.for('@domain-expansion:astro');

export const interceptorPlugin = (astroConfig: AstroConfig, routeEntrypoints: string[]): Plugin => {
  let viteConfig: any;

  return {
    name: '@domain-expansion/interceptor',
    enforce: 'post',
    configResolved(config) {
      viteConfig = config;
      const { resolve: resolver } = createResolver(config.root);

      (globalThis as any)[sym] = makeCaching(
        new Cache(resolver('node_modules/.domain-expansion')),
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
const sym = Symbol.for('@domain-expansion:astro');
export const domainExpansion = globalThis[sym] ?? ((_, fns) => fns);
`;
    },
    async transform(code, id, { ssr } = {}) {
      if (!ssr) return;
      if (!id.endsWith('.astro')) return;

      // const result = await compile({
      //   astroConfig,
      //   viteConfig: viteConfig!,
      //   filename: id,
      //   source: readFileSync(id, "utf-8"),
      //   preferences: {} as any
      // });

      const modInfo = this.getModuleInfo(id)!;
      const scope = modInfo.meta.astro.scope;

      debug('Transforming:', { id, scope });

      const ms = new MagicString(code);

      const endOfImport = code.indexOf(SEARCH_STR);

      const modMeta = JSON.stringify({ scope, id })

      if (code.includes('renderComponent as $$renderComponent')) {
        ms.appendRight(endOfImport + SEARCH_STR.length, `
import {domainExpansion as $$domainExpansion} from "${MODULE_ID}";
const {render: $$render, renderComponent: $$renderComponent} = $$domainExpansion(${modMeta}, {
  render: $$render_original,
  renderComponent: $$renderComponent_original,
});
`);
        ms.replace('renderComponent as $$renderComponent', 'renderComponent as $$renderComponent_original');
      } else {
        ms.appendRight(endOfImport + SEARCH_STR.length, `
import {domainExpansion as $$domainExpansion} from "${MODULE_ID}";
const {render: $$render} = $$domainExpansion(${modMeta}, {
  render: $$render_original,
});
`);
      }

      ms.replace('render as $$render', 'render as $$render_original');

      return {
        code: ms.toString(),
        map: ms.generateMap(),
      };
    },
  }
}
