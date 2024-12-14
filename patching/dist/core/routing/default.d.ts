import type { ComponentInstance, ManifestData } from '../../types/astro.js';
import type { SSRManifest } from '../app/types.js';
export declare function injectDefaultRoutes(ssrManifest: SSRManifest, routeManifest: ManifestData): ManifestData;
type DefaultRouteParams = {
    instance: ComponentInstance;
    matchesComponent(filePath: URL): boolean;
    route: string;
    component: string;
};
export declare function createDefaultRoutes(manifest: SSRManifest): DefaultRouteParams[];
export {};
