import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import { bold } from "kleur/colors";
import { normalizePath } from "vite";
import { warnMissingAdapter } from "../core/dev/adapter-validation.js";
import { getRoutePrerenderOption } from "../core/routing/manifest/prerender.js";
import { isEndpoint, isPage } from "../core/util.js";
import { rootRelativePath } from "../core/viteUtils.js";
const KNOWN_FILE_EXTENSIONS = [".astro", ".js", ".ts"];
function astroScannerPlugin({
  settings,
  logger,
  manifest
}) {
  return {
    name: "astro:scanner",
    enforce: "post",
    async transform(code, id, options) {
      if (!options?.ssr) return;
      const filename = normalizePath(id);
      let fileURL;
      try {
        fileURL = new URL(`file://${filename}`);
      } catch {
        return;
      }
      const fileIsPage = isPage(fileURL, settings);
      const fileIsEndpoint = isEndpoint(fileURL, settings);
      if (!(fileIsPage || fileIsEndpoint)) return;
      const route = manifest.routes.find((r) => {
        const filePath = new URL(`./${r.component}`, settings.config.root);
        return normalizePath(fileURLToPath(filePath)) === filename;
      });
      if (!route) {
        return;
      }
      if (!route.prerender && code.includes("getStaticPaths") && // this should only be valid for `.astro`, `.js` and `.ts` files
      KNOWN_FILE_EXTENSIONS.includes(extname(filename))) {
        logger.warn(
          "router",
          `getStaticPaths() ignored in dynamic page ${bold(
            rootRelativePath(settings.config.root, fileURL, true)
          )}. Add \`export const prerender = true;\` to prerender the page as static HTML during the build process.`
        );
      }
      const { meta = {} } = this.getModuleInfo(id) ?? {};
      return {
        code,
        map: null,
        meta: {
          ...meta,
          astro: {
            ...meta.astro ?? { hydratedComponents: [], clientOnlyComponents: [], scripts: [] },
            pageOptions: {
              prerender: route.prerender
            }
          }
        }
      };
    },
    // Handle hot updates to update the prerender option
    async handleHotUpdate(ctx) {
      const filename = normalizePath(ctx.file);
      let fileURL;
      try {
        fileURL = new URL(`file://${filename}`);
      } catch {
        return;
      }
      const fileIsPage = isPage(fileURL, settings);
      const fileIsEndpoint = isEndpoint(fileURL, settings);
      if (!(fileIsPage || fileIsEndpoint)) return;
      const route = manifest.routes.find((r) => {
        const filePath = new URL(`./${r.component}`, settings.config.root);
        return normalizePath(fileURLToPath(filePath)) === filename;
      });
      if (!route) {
        return;
      }
      await getRoutePrerenderOption(await ctx.read(), route, settings, logger);
      warnMissingAdapter(logger, settings);
    }
  };
}
export {
  astroScannerPlugin as default
};
