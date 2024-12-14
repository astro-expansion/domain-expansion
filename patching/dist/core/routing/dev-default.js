import { ensureImageEndpointRoute } from "../../assets/endpoint/config.js";
import { injectDefaultRoutes } from "./default.js";
function injectDefaultDevRoutes(settings, ssrManifest, routeManifest) {
  ensureImageEndpointRoute(settings, routeManifest, "dev");
  injectDefaultRoutes(ssrManifest, routeManifest);
  return routeManifest;
}
export {
  injectDefaultDevRoutes
};
