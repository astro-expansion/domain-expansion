import type { ComponentInstance, ManifestData } from '../../types/astro.js';
import type { RouteData } from '../../types/public/internal.js';
export declare const DEFAULT_404_ROUTE: RouteData;
export declare const DEFAULT_500_ROUTE: RouteData;
export declare function ensure404Route(manifest: ManifestData): ManifestData;
export declare const default404Instance: ComponentInstance;
