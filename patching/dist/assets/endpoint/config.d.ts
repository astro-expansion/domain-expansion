import type { AstroSettings, ManifestData } from '../../types/astro.js';
export declare function injectImageEndpoint(settings: AstroSettings, manifest: ManifestData, mode: 'dev' | 'build', cwd?: string): void;
export declare function ensureImageEndpointRoute(settings: AstroSettings, manifest: ManifestData, mode: 'dev' | 'build', cwd?: string): void;
