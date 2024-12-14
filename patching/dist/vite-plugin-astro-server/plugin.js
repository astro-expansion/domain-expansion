import { AsyncLocalStorage } from "node:async_hooks";
import { IncomingMessage } from "node:http";
import { fileURLToPath } from "node:url";
import { normalizePath } from "vite";
import { warnMissingAdapter } from "../core/dev/adapter-validation.js";
import { createKey, getEnvironmentKey, hasEnvironmentKey } from "../core/encryption.js";
import { getViteErrorPayload } from "../core/errors/dev/index.js";
import { AstroError, AstroErrorData } from "../core/errors/index.js";
import { patchOverlay } from "../core/errors/overlay.js";
import { NOOP_MIDDLEWARE_FN } from "../core/middleware/noop-middleware.js";
import { createViteLoader } from "../core/module-loader/index.js";
import { injectDefaultDevRoutes } from "../core/routing/dev-default.js";
import { createRouteManifest } from "../core/routing/index.js";
import { getRoutePrerenderOption } from "../core/routing/manifest/prerender.js";
import { toFallbackType, toRoutingStrategy } from "../i18n/utils.js";
import { runHookRoutesResolved } from "../integrations/hooks.js";
import { baseMiddleware } from "./base.js";
import { createController } from "./controller.js";
import { recordServerError } from "./error.js";
import { DevPipeline } from "./pipeline.js";
import { handleRequest } from "./request.js";
import { setRouteError } from "./server-state.js";
function createVitePluginAstroServer({
  settings,
  logger,
  fs: fsMod,
  manifest: routeManifest,
  ssrManifest: devSSRManifest
}) {
  return {
    name: "astro:server",
    configureServer(viteServer) {
      const loader = createViteLoader(viteServer);
      const pipeline = DevPipeline.create(routeManifest, {
        loader,
        logger,
        manifest: devSSRManifest,
        settings
      });
      const controller = createController({ loader });
      const localStorage = new AsyncLocalStorage();
      async function rebuildManifest(path = null) {
        pipeline.clearRouteCache();
        if (path !== null) {
          const route = routeManifest.routes.find(
            (r) => normalizePath(path) === normalizePath(fileURLToPath(new URL(r.component, settings.config.root)))
          );
          if (!route) {
            return;
          }
          if (route.type !== "page" && route.type !== "endpoint") return;
          const routePath = fileURLToPath(new URL(route.component, settings.config.root));
          try {
            const content = await fsMod.promises.readFile(routePath, "utf-8");
            await getRoutePrerenderOption(content, route, settings, logger);
          } catch (_) {
          }
        } else {
          routeManifest = injectDefaultDevRoutes(
            settings,
            devSSRManifest,
            await createRouteManifest({ settings, fsMod }, logger, { dev: true })
          );
        }
        await runHookRoutesResolved({ routes: routeManifest.routes, settings, logger });
        warnMissingAdapter(logger, settings);
        pipeline.manifest.checkOrigin = settings.config.security.checkOrigin && settings.buildOutput === "server";
        pipeline.setManifestData(routeManifest);
      }
      viteServer.watcher.on("add", rebuildManifest.bind(null, null));
      viteServer.watcher.on("unlink", rebuildManifest.bind(null, null));
      viteServer.watcher.on("change", rebuildManifest);
      function handleUnhandledRejection(rejection) {
        const error = new AstroError({
          ...AstroErrorData.UnhandledRejection,
          message: AstroErrorData.UnhandledRejection.message(rejection?.stack || rejection)
        });
        const store = localStorage.getStore();
        if (store instanceof IncomingMessage) {
          const request = store;
          setRouteError(controller.state, request.url, error);
        }
        const { errorWithMetadata } = recordServerError(loader, settings.config, pipeline, error);
        setTimeout(
          async () => loader.webSocketSend(await getViteErrorPayload(errorWithMetadata)),
          200
        );
      }
      process.on("unhandledRejection", handleUnhandledRejection);
      viteServer.httpServer?.on("close", () => {
        process.off("unhandledRejection", handleUnhandledRejection);
      });
      return () => {
        viteServer.middlewares.stack.unshift({
          route: "",
          handle: baseMiddleware(settings, logger)
        });
        viteServer.middlewares.use(async function astroDevHandler(request, response) {
          if (request.url === void 0 || !request.method) {
            response.writeHead(500, "Incomplete request");
            response.end();
            return;
          }
          localStorage.run(request, () => {
            handleRequest({
              pipeline,
              manifestData: routeManifest,
              controller,
              incomingRequest: request,
              incomingResponse: response
            });
          });
        });
      };
    },
    transform(code, id, opts = {}) {
      if (opts.ssr) return;
      if (!id.includes("vite/dist/client/client.mjs")) return;
      return patchOverlay(code);
    }
  };
}
function createDevelopmentManifest(settings) {
  let i18nManifest = void 0;
  if (settings.config.i18n) {
    i18nManifest = {
      fallback: settings.config.i18n.fallback,
      strategy: toRoutingStrategy(settings.config.i18n.routing, settings.config.i18n.domains),
      defaultLocale: settings.config.i18n.defaultLocale,
      locales: settings.config.i18n.locales,
      domainLookupTable: {},
      fallbackType: toFallbackType(settings.config.i18n.routing)
    };
  }
  return {
    hrefRoot: settings.config.root.toString(),
    trailingSlash: settings.config.trailingSlash,
    buildFormat: settings.config.build.format,
    compressHTML: settings.config.compressHTML,
    assets: /* @__PURE__ */ new Set(),
    entryModules: {},
    routes: [],
    adapterName: settings?.adapter?.name || "",
    clientDirectives: settings.clientDirectives,
    renderers: [],
    base: settings.config.base,
    assetsPrefix: settings.config.build.assetsPrefix,
    site: settings.config.site,
    componentMetadata: /* @__PURE__ */ new Map(),
    inlinedScripts: /* @__PURE__ */ new Map(),
    i18n: i18nManifest,
    checkOrigin: (settings.config.security?.checkOrigin && settings.buildOutput === "server") ?? false,
    key: hasEnvironmentKey() ? getEnvironmentKey() : createKey(),
    middleware() {
      return {
        onRequest: NOOP_MIDDLEWARE_FN
      };
    }
  };
}
export {
  createDevelopmentManifest,
  createVitePluginAstroServer as default
};
