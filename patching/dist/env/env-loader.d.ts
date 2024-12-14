import type { AstroConfig } from '../types/public/index.js';
export declare const createEnvLoader: () => {
    load: (mode: string, config: AstroConfig) => Record<string, string>;
    getPrivateEnv: () => Record<string, string>;
};
export type EnvLoader = ReturnType<typeof createEnvLoader>;
