import nodeFs from "node:fs";
import * as vite from "vite";
import {
  runHookConfigDone,
  runHookConfigSetup,
  runHookRoutesResolved,
  runHookServerDone,
  runHookServerStart
} from "../../integrations/hooks.js";
import { createDevelopmentManifest } from "../../vite-plugin-astro-server/plugin.js";
import { createVite } from "../create-vite.js";
import { apply as applyPolyfill } from "../polyfill.js";
import { injectDefaultDevRoutes } from "../routing/dev-default.js";
import { createRouteManifest } from "../routing/index.js";
import { syncInternal } from "../sync/index.js";
import { warnMissingAdapter } from "./adapter-validation.js";
async function createContainer({
  isRestart = false,
  logger,
  inlineConfig,
  settings,
  fs = nodeFs
}) {
  applyPolyfill();
  settings = await runHookConfigSetup({
    settings,
    command: "dev",
    logger,
    isRestart
  });
  const {
    base,
    server: { host, headers, open: serverOpen }
  } = settings.config;
  const isServerOpenURL = typeof serverOpen == "string" && !isRestart;
  const isServerOpenBoolean = serverOpen && !isRestart;
  const open = isServerOpenURL ? serverOpen : isServerOpenBoolean ? base : false;
  const rendererClientEntries = settings.renderers.map((r) => r.clientEntrypoint).filter(Boolean);
  let manifest = await createRouteManifest({ settings, fsMod: fs }, logger, { dev: true });
  const devSSRManifest = createDevelopmentManifest(settings);
  manifest = injectDefaultDevRoutes(settings, devSSRManifest, manifest);
  await runHookRoutesResolved({ settings, logger, routes: manifest.routes });
  await runHookConfigDone({ settings, logger, command: "dev" });
  warnMissingAdapter(logger, settings);
  const mode = inlineConfig?.mode ?? "development";
  const viteConfig = await createVite(
    {
      server: { host, headers, open },
      optimizeDeps: {
        include: rendererClientEntries
      }
    },
    {
      settings,
      logger,
      mode,
      command: "dev",
      fs,
      sync: false,
      manifest,
      ssrManifest: devSSRManifest
    }
  );
  await syncInternal({
    settings,
    mode,
    logger,
    skip: {
      content: true,
      cleanup: true
    },
    force: inlineConfig?.force,
    manifest
  });
  const viteServer = await vite.createServer(viteConfig);
  const container = {
    inlineConfig: inlineConfig ?? {},
    fs,
    logger,
    restartInFlight: false,
    settings,
    viteServer,
    handle(req, res) {
      viteServer.middlewares.handle(req, res, Function.prototype);
    },
    // TODO deprecate and remove
    close() {
      return closeContainer(container);
    }
  };
  return container;
}
async function closeContainer({ viteServer, settings, logger }) {
  await viteServer.close();
  await runHookServerDone({
    config: settings.config,
    logger
  });
}
async function startContainer({
  settings,
  viteServer,
  logger
}) {
  const { port } = settings.config.server;
  await viteServer.listen(port);
  const devServerAddressInfo = viteServer.httpServer.address();
  await runHookServerStart({
    config: settings.config,
    address: devServerAddressInfo,
    logger
  });
  return devServerAddressInfo;
}
export {
  createContainer,
  startContainer
};
