import fsMod, { existsSync } from "node:fs";
import { dirname, relative } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { dim } from "kleur/colors";
import { createServer } from "vite";
import { normalizePath } from "vite";
import { CONTENT_TYPES_FILE } from "../../content/consts.js";
import { getDataStoreFile, globalContentLayer } from "../../content/content-layer.js";
import { createContentTypesGenerator } from "../../content/index.js";
import { MutableDataStore } from "../../content/mutable-data-store.js";
import { getContentPaths, globalContentConfigObserver } from "../../content/utils.js";
import { syncAstroEnv } from "../../env/sync.js";
import { telemetry } from "../../events/index.js";
import { eventCliSession } from "../../events/session.js";
import { runHookConfigDone, runHookConfigSetup } from "../../integrations/hooks.js";
import { getTimeStat } from "../build/util.js";
import { resolveConfig } from "../config/config.js";
import { createNodeLogger } from "../config/logging.js";
import { createSettings } from "../config/settings.js";
import { createVite } from "../create-vite.js";
import {
  AstroError,
  AstroErrorData,
  AstroUserError,
  createSafeError,
  isAstroError
} from "../errors/index.js";
import { createRouteManifest } from "../routing/index.js";
import { ensureProcessNodeEnv } from "../util.js";
async function sync(inlineConfig, { fs, telemetry: _telemetry = false } = {}) {
  ensureProcessNodeEnv("production");
  const logger = createNodeLogger(inlineConfig);
  const { astroConfig, userConfig } = await resolveConfig(inlineConfig ?? {}, "sync");
  if (_telemetry) {
    telemetry.record(eventCliSession("sync", userConfig));
  }
  let settings = await createSettings(astroConfig, inlineConfig.root);
  settings = await runHookConfigSetup({
    command: "sync",
    settings,
    logger
  });
  const manifest = await createRouteManifest({ settings, fsMod: fs }, logger);
  await runHookConfigDone({ settings, logger });
  return await syncInternal({
    settings,
    logger,
    mode: "production",
    fs,
    force: inlineConfig.force,
    manifest
  });
}
async function clearContentLayerCache({
  settings,
  logger,
  fs = fsMod
}) {
  const dataStore = getDataStoreFile(settings);
  if (fs.existsSync(dataStore)) {
    logger.debug("content", "clearing data store");
    await fs.promises.rm(dataStore, { force: true });
    logger.warn("content", "data store cleared (force)");
  }
}
async function syncInternal({
  mode,
  logger,
  fs = fsMod,
  settings,
  skip,
  force,
  manifest
}) {
  if (force) {
    await clearContentLayerCache({ settings, logger, fs });
  }
  const timerStart = performance.now();
  if (!skip?.content) {
    await syncContentCollections(settings, { mode, fs, logger, manifest });
    settings.timer.start("Sync content layer");
    let store;
    try {
      const dataStoreFile = getDataStoreFile(settings);
      if (existsSync(dataStoreFile)) {
        store = await MutableDataStore.fromFile(dataStoreFile);
      }
    } catch (err) {
      logger.error("content", err.message);
    }
    if (!store) {
      store = new MutableDataStore();
    }
    const contentLayer = globalContentLayer.init({
      settings,
      logger,
      store
    });
    await contentLayer.sync();
    if (!skip?.cleanup) {
      contentLayer.dispose();
    }
    settings.timer.end("Sync content layer");
  } else {
    const paths = getContentPaths(settings.config, fs);
    if (paths.config.exists || // Legacy collections don't require a config file
    settings.config.legacy?.collections && fs.existsSync(paths.contentDir)) {
      settings.injectedTypes.push({
        filename: CONTENT_TYPES_FILE,
        content: ""
      });
    }
  }
  syncAstroEnv(settings);
  writeInjectedTypes(settings, fs);
  logger.info("types", `Generated ${dim(getTimeStat(timerStart, performance.now()))}`);
}
function getTsReference(type, value) {
  return `/// <reference ${type}=${JSON.stringify(value)} />`;
}
const CLIENT_TYPES_REFERENCE = getTsReference("types", "astro/client");
function writeInjectedTypes(settings, fs) {
  const references = [];
  for (const { filename, content } of settings.injectedTypes) {
    const filepath = fileURLToPath(new URL(filename, settings.dotAstroDir));
    fs.mkdirSync(dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, content, "utf-8");
    references.push(normalizePath(relative(fileURLToPath(settings.dotAstroDir), filepath)));
  }
  const astroDtsContent = `${CLIENT_TYPES_REFERENCE}
${references.map((reference) => getTsReference("path", reference)).join("\n")}`;
  if (references.length === 0) {
    fs.mkdirSync(settings.dotAstroDir, { recursive: true });
  }
  fs.writeFileSync(
    fileURLToPath(new URL("./types.d.ts", settings.dotAstroDir)),
    astroDtsContent,
    "utf-8"
  );
}
async function syncContentCollections(settings, {
  mode,
  logger,
  fs,
  manifest
}) {
  const tempViteServer = await createServer(
    await createVite(
      {
        server: { middlewareMode: true, hmr: false, watch: null, ws: false },
        optimizeDeps: { noDiscovery: true },
        ssr: { external: [] },
        logLevel: "silent"
      },
      { settings, logger, mode, command: "build", fs, sync: true, manifest }
    )
  );
  const hotSend = tempViteServer.hot.send;
  tempViteServer.hot.send = (payload) => {
    if (payload.type === "error") {
      throw payload.err;
    }
    return hotSend(payload);
  };
  try {
    const contentTypesGenerator = await createContentTypesGenerator({
      contentConfigObserver: globalContentConfigObserver,
      logger,
      fs,
      settings,
      viteServer: tempViteServer
    });
    const typesResult = await contentTypesGenerator.init();
    const contentConfig = globalContentConfigObserver.get();
    if (contentConfig.status === "error") {
      throw contentConfig.error;
    }
    if (typesResult.typesGenerated === false) {
      switch (typesResult.reason) {
        case "no-content-dir":
        default:
          logger.debug("types", "No content directory found. Skipping type generation.");
      }
    }
  } catch (e) {
    const safeError = createSafeError(e);
    if (isAstroError(e)) {
      throw e;
    }
    let configFile;
    try {
      const contentPaths = getContentPaths(settings.config, fs);
      if (contentPaths.config.exists) {
        const matches = /\/(src\/.+)/.exec(contentPaths.config.url.href);
        if (matches) {
          configFile = matches[1];
        }
      }
    } catch {
    }
    const hint = AstroUserError.is(e) ? e.hint : AstroErrorData.GenerateContentTypesError.hint(configFile);
    throw new AstroError(
      {
        ...AstroErrorData.GenerateContentTypesError,
        hint,
        message: AstroErrorData.GenerateContentTypesError.message(safeError.message),
        location: safeError.loc
      },
      { cause: e }
    );
  } finally {
    await tempViteServer.close();
  }
}
export {
  clearContentLayerCache,
  sync as default,
  syncInternal
};
