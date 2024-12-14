import fsMod from 'node:fs';
import type { PluginContext } from 'rollup';
import type { ViteDevServer } from 'vite';
import { z } from 'zod';
import type { Logger } from '../core/logger/core.js';
import type { AstroSettings } from '../types/astro.js';
import type { AstroConfig } from '../types/public/config.js';
import type { ContentEntryType, DataEntryType } from '../types/public/content.js';
import { CONTENT_FLAGS } from './consts.js';
/**
 * Amap from a collection + slug to the local file path.
 * This is used internally to resolve entry imports when using `getEntry()`.
 * @see `templates/content/module.mjs`
 */
export type ContentLookupMap = {
    [collectionName: string]: {
        type: 'content' | 'data';
        entries: {
            [lookupId: string]: string;
        };
    };
};
declare const collectionConfigParser: z.ZodUnion<[z.ZodObject<{
    type: z.ZodDefault<z.ZodOptional<z.ZodLiteral<"content">>>;
    schema: z.ZodOptional<z.ZodAny>;
}, "strip", z.ZodTypeAny, {
    type: "content";
    schema?: any;
}, {
    type?: "content" | undefined;
    schema?: any;
}>, z.ZodObject<{
    type: z.ZodLiteral<"data">;
    schema: z.ZodOptional<z.ZodAny>;
}, "strip", z.ZodTypeAny, {
    type: "data";
    schema?: any;
}, {
    type: "data";
    schema?: any;
}>, z.ZodObject<{
    type: z.ZodLiteral<"content_layer">;
    schema: z.ZodOptional<z.ZodAny>;
    loader: z.ZodUnion<[z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodUnion<[z.ZodArray<z.ZodObject<{
        id: z.ZodCatch<z.ZodString>;
    }, "strip", z.ZodUnknown, z.objectOutputType<{
        id: z.ZodCatch<z.ZodString>;
    }, z.ZodUnknown, "strip">, z.objectInputType<{
        id: z.ZodCatch<z.ZodString>;
    }, z.ZodUnknown, "strip">>, "many">, z.ZodPromise<z.ZodArray<z.ZodObject<{
        id: z.ZodCatch<z.ZodString>;
    }, "strip", z.ZodUnknown, z.objectOutputType<{
        id: z.ZodCatch<z.ZodString>;
    }, z.ZodUnknown, "strip">, z.objectInputType<{
        id: z.ZodCatch<z.ZodString>;
    }, z.ZodUnknown, "strip">>, "many">>, z.ZodRecord<z.ZodString, z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodUnknown, z.objectOutputType<{
        id: z.ZodOptional<z.ZodString>;
    }, z.ZodUnknown, "strip">, z.objectInputType<{
        id: z.ZodOptional<z.ZodString>;
    }, z.ZodUnknown, "strip">>>, z.ZodPromise<z.ZodRecord<z.ZodString, z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodUnknown, z.objectOutputType<{
        id: z.ZodOptional<z.ZodString>;
    }, z.ZodUnknown, "strip">, z.objectInputType<{
        id: z.ZodOptional<z.ZodString>;
    }, z.ZodUnknown, "strip">>>>]>>, z.ZodObject<{
        name: z.ZodString;
        load: z.ZodFunction<z.ZodTuple<[z.ZodObject<{
            collection: z.ZodString;
            store: z.ZodAny;
            meta: z.ZodAny;
            logger: z.ZodAny;
            config: z.ZodAny;
            entryTypes: z.ZodAny;
            parseData: z.ZodAny;
            generateDigest: z.ZodFunction<z.ZodTuple<[z.ZodAny], null>, z.ZodUnknown>;
            watcher: z.ZodOptional<z.ZodAny>;
            refreshContextData: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, "strip", z.ZodTypeAny, {
            collection: string;
            generateDigest: (args_0: any) => unknown;
            config?: any;
            meta?: any;
            logger?: any;
            watcher?: any;
            parseData?: any;
            store?: any;
            entryTypes?: any;
            refreshContextData?: Record<string, unknown> | undefined;
        }, {
            collection: string;
            generateDigest: (args_0: any) => unknown;
            config?: any;
            meta?: any;
            logger?: any;
            watcher?: any;
            parseData?: any;
            store?: any;
            entryTypes?: any;
            refreshContextData?: Record<string, unknown> | undefined;
        }>], null>, z.ZodUnknown>;
        schema: z.ZodOptional<z.ZodAny>;
        render: z.ZodOptional<z.ZodFunction<z.ZodTuple<[z.ZodAny], null>, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        load: (args_0: {
            collection: string;
            generateDigest: (args_0: any) => unknown;
            config?: any;
            meta?: any;
            logger?: any;
            watcher?: any;
            parseData?: any;
            store?: any;
            entryTypes?: any;
            refreshContextData?: Record<string, unknown> | undefined;
        }) => unknown;
        name: string;
        render?: ((args_0: any) => unknown) | undefined;
        schema?: any;
    }, {
        load: (args_0: {
            collection: string;
            generateDigest: (args_0: any) => unknown;
            config?: any;
            meta?: any;
            logger?: any;
            watcher?: any;
            parseData?: any;
            store?: any;
            entryTypes?: any;
            refreshContextData?: Record<string, unknown> | undefined;
        }) => unknown;
        name: string;
        render?: ((args_0: any) => unknown) | undefined;
        schema?: any;
    }>]>;
    /** deprecated */
    _legacy: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    type: "content_layer";
    loader: ((...args: unknown[]) => z.objectOutputType<{
        id: z.ZodCatch<z.ZodString>;
    }, z.ZodUnknown, "strip">[] | Promise<z.objectOutputType<{
        id: z.ZodCatch<z.ZodString>;
    }, z.ZodUnknown, "strip">[]> | Record<string, z.objectOutputType<{
        id: z.ZodOptional<z.ZodString>;
    }, z.ZodUnknown, "strip">> | Promise<Record<string, z.objectOutputType<{
        id: z.ZodOptional<z.ZodString>;
    }, z.ZodUnknown, "strip">>>) | {
        load: (args_0: {
            collection: string;
            generateDigest: (args_0: any) => unknown;
            config?: any;
            meta?: any;
            logger?: any;
            watcher?: any;
            parseData?: any;
            store?: any;
            entryTypes?: any;
            refreshContextData?: Record<string, unknown> | undefined;
        }) => unknown;
        name: string;
        render?: ((args_0: any) => unknown) | undefined;
        schema?: any;
    };
    schema?: any;
    _legacy?: boolean | undefined;
}, {
    type: "content_layer";
    loader: ((...args: unknown[]) => z.objectInputType<{
        id: z.ZodCatch<z.ZodString>;
    }, z.ZodUnknown, "strip">[] | Promise<z.objectInputType<{
        id: z.ZodCatch<z.ZodString>;
    }, z.ZodUnknown, "strip">[]> | Record<string, z.objectInputType<{
        id: z.ZodOptional<z.ZodString>;
    }, z.ZodUnknown, "strip">> | Promise<Record<string, z.objectInputType<{
        id: z.ZodOptional<z.ZodString>;
    }, z.ZodUnknown, "strip">>>) | {
        load: (args_0: {
            collection: string;
            generateDigest: (args_0: any) => unknown;
            config?: any;
            meta?: any;
            logger?: any;
            watcher?: any;
            parseData?: any;
            store?: any;
            entryTypes?: any;
            refreshContextData?: Record<string, unknown> | undefined;
        }) => unknown;
        name: string;
        render?: ((args_0: any) => unknown) | undefined;
        schema?: any;
    };
    schema?: any;
    _legacy?: boolean | undefined;
}>]>;
declare const contentConfigParser: z.ZodObject<{
    collections: z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodObject<{
        type: z.ZodDefault<z.ZodOptional<z.ZodLiteral<"content">>>;
        schema: z.ZodOptional<z.ZodAny>;
    }, "strip", z.ZodTypeAny, {
        type: "content";
        schema?: any;
    }, {
        type?: "content" | undefined;
        schema?: any;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"data">;
        schema: z.ZodOptional<z.ZodAny>;
    }, "strip", z.ZodTypeAny, {
        type: "data";
        schema?: any;
    }, {
        type: "data";
        schema?: any;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"content_layer">;
        schema: z.ZodOptional<z.ZodAny>;
        loader: z.ZodUnion<[z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodUnion<[z.ZodArray<z.ZodObject<{
            id: z.ZodCatch<z.ZodString>;
        }, "strip", z.ZodUnknown, z.objectOutputType<{
            id: z.ZodCatch<z.ZodString>;
        }, z.ZodUnknown, "strip">, z.objectInputType<{
            id: z.ZodCatch<z.ZodString>;
        }, z.ZodUnknown, "strip">>, "many">, z.ZodPromise<z.ZodArray<z.ZodObject<{
            id: z.ZodCatch<z.ZodString>;
        }, "strip", z.ZodUnknown, z.objectOutputType<{
            id: z.ZodCatch<z.ZodString>;
        }, z.ZodUnknown, "strip">, z.objectInputType<{
            id: z.ZodCatch<z.ZodString>;
        }, z.ZodUnknown, "strip">>, "many">>, z.ZodRecord<z.ZodString, z.ZodObject<{
            id: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodUnknown, z.objectOutputType<{
            id: z.ZodOptional<z.ZodString>;
        }, z.ZodUnknown, "strip">, z.objectInputType<{
            id: z.ZodOptional<z.ZodString>;
        }, z.ZodUnknown, "strip">>>, z.ZodPromise<z.ZodRecord<z.ZodString, z.ZodObject<{
            id: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodUnknown, z.objectOutputType<{
            id: z.ZodOptional<z.ZodString>;
        }, z.ZodUnknown, "strip">, z.objectInputType<{
            id: z.ZodOptional<z.ZodString>;
        }, z.ZodUnknown, "strip">>>>]>>, z.ZodObject<{
            name: z.ZodString;
            load: z.ZodFunction<z.ZodTuple<[z.ZodObject<{
                collection: z.ZodString;
                store: z.ZodAny;
                meta: z.ZodAny;
                logger: z.ZodAny;
                config: z.ZodAny;
                entryTypes: z.ZodAny;
                parseData: z.ZodAny;
                generateDigest: z.ZodFunction<z.ZodTuple<[z.ZodAny], null>, z.ZodUnknown>;
                watcher: z.ZodOptional<z.ZodAny>;
                refreshContextData: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            }, "strip", z.ZodTypeAny, {
                collection: string;
                generateDigest: (args_0: any) => unknown;
                config?: any;
                meta?: any;
                logger?: any;
                watcher?: any;
                parseData?: any;
                store?: any;
                entryTypes?: any;
                refreshContextData?: Record<string, unknown> | undefined;
            }, {
                collection: string;
                generateDigest: (args_0: any) => unknown;
                config?: any;
                meta?: any;
                logger?: any;
                watcher?: any;
                parseData?: any;
                store?: any;
                entryTypes?: any;
                refreshContextData?: Record<string, unknown> | undefined;
            }>], null>, z.ZodUnknown>;
            schema: z.ZodOptional<z.ZodAny>;
            render: z.ZodOptional<z.ZodFunction<z.ZodTuple<[z.ZodAny], null>, z.ZodUnknown>>;
        }, "strip", z.ZodTypeAny, {
            load: (args_0: {
                collection: string;
                generateDigest: (args_0: any) => unknown;
                config?: any;
                meta?: any;
                logger?: any;
                watcher?: any;
                parseData?: any;
                store?: any;
                entryTypes?: any;
                refreshContextData?: Record<string, unknown> | undefined;
            }) => unknown;
            name: string;
            render?: ((args_0: any) => unknown) | undefined;
            schema?: any;
        }, {
            load: (args_0: {
                collection: string;
                generateDigest: (args_0: any) => unknown;
                config?: any;
                meta?: any;
                logger?: any;
                watcher?: any;
                parseData?: any;
                store?: any;
                entryTypes?: any;
                refreshContextData?: Record<string, unknown> | undefined;
            }) => unknown;
            name: string;
            render?: ((args_0: any) => unknown) | undefined;
            schema?: any;
        }>]>;
        /** deprecated */
        _legacy: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        type: "content_layer";
        loader: ((...args: unknown[]) => z.objectOutputType<{
            id: z.ZodCatch<z.ZodString>;
        }, z.ZodUnknown, "strip">[] | Promise<z.objectOutputType<{
            id: z.ZodCatch<z.ZodString>;
        }, z.ZodUnknown, "strip">[]> | Record<string, z.objectOutputType<{
            id: z.ZodOptional<z.ZodString>;
        }, z.ZodUnknown, "strip">> | Promise<Record<string, z.objectOutputType<{
            id: z.ZodOptional<z.ZodString>;
        }, z.ZodUnknown, "strip">>>) | {
            load: (args_0: {
                collection: string;
                generateDigest: (args_0: any) => unknown;
                config?: any;
                meta?: any;
                logger?: any;
                watcher?: any;
                parseData?: any;
                store?: any;
                entryTypes?: any;
                refreshContextData?: Record<string, unknown> | undefined;
            }) => unknown;
            name: string;
            render?: ((args_0: any) => unknown) | undefined;
            schema?: any;
        };
        schema?: any;
        _legacy?: boolean | undefined;
    }, {
        type: "content_layer";
        loader: ((...args: unknown[]) => z.objectInputType<{
            id: z.ZodCatch<z.ZodString>;
        }, z.ZodUnknown, "strip">[] | Promise<z.objectInputType<{
            id: z.ZodCatch<z.ZodString>;
        }, z.ZodUnknown, "strip">[]> | Record<string, z.objectInputType<{
            id: z.ZodOptional<z.ZodString>;
        }, z.ZodUnknown, "strip">> | Promise<Record<string, z.objectInputType<{
            id: z.ZodOptional<z.ZodString>;
        }, z.ZodUnknown, "strip">>>) | {
            load: (args_0: {
                collection: string;
                generateDigest: (args_0: any) => unknown;
                config?: any;
                meta?: any;
                logger?: any;
                watcher?: any;
                parseData?: any;
                store?: any;
                entryTypes?: any;
                refreshContextData?: Record<string, unknown> | undefined;
            }) => unknown;
            name: string;
            render?: ((args_0: any) => unknown) | undefined;
            schema?: any;
        };
        schema?: any;
        _legacy?: boolean | undefined;
    }>]>>;
}, "strip", z.ZodTypeAny, {
    collections: Record<string, {
        type: "content";
        schema?: any;
    } | {
        type: "data";
        schema?: any;
    } | {
        type: "content_layer";
        loader: ((...args: unknown[]) => z.objectOutputType<{
            id: z.ZodCatch<z.ZodString>;
        }, z.ZodUnknown, "strip">[] | Promise<z.objectOutputType<{
            id: z.ZodCatch<z.ZodString>;
        }, z.ZodUnknown, "strip">[]> | Record<string, z.objectOutputType<{
            id: z.ZodOptional<z.ZodString>;
        }, z.ZodUnknown, "strip">> | Promise<Record<string, z.objectOutputType<{
            id: z.ZodOptional<z.ZodString>;
        }, z.ZodUnknown, "strip">>>) | {
            load: (args_0: {
                collection: string;
                generateDigest: (args_0: any) => unknown;
                config?: any;
                meta?: any;
                logger?: any;
                watcher?: any;
                parseData?: any;
                store?: any;
                entryTypes?: any;
                refreshContextData?: Record<string, unknown> | undefined;
            }) => unknown;
            name: string;
            render?: ((args_0: any) => unknown) | undefined;
            schema?: any;
        };
        schema?: any;
        _legacy?: boolean | undefined;
    }>;
}, {
    collections: Record<string, {
        type?: "content" | undefined;
        schema?: any;
    } | {
        type: "data";
        schema?: any;
    } | {
        type: "content_layer";
        loader: ((...args: unknown[]) => z.objectInputType<{
            id: z.ZodCatch<z.ZodString>;
        }, z.ZodUnknown, "strip">[] | Promise<z.objectInputType<{
            id: z.ZodCatch<z.ZodString>;
        }, z.ZodUnknown, "strip">[]> | Record<string, z.objectInputType<{
            id: z.ZodOptional<z.ZodString>;
        }, z.ZodUnknown, "strip">> | Promise<Record<string, z.objectInputType<{
            id: z.ZodOptional<z.ZodString>;
        }, z.ZodUnknown, "strip">>>) | {
            load: (args_0: {
                collection: string;
                generateDigest: (args_0: any) => unknown;
                config?: any;
                meta?: any;
                logger?: any;
                watcher?: any;
                parseData?: any;
                store?: any;
                entryTypes?: any;
                refreshContextData?: Record<string, unknown> | undefined;
            }) => unknown;
            name: string;
            render?: ((args_0: any) => unknown) | undefined;
            schema?: any;
        };
        schema?: any;
        _legacy?: boolean | undefined;
    }>;
}>;
export type CollectionConfig = z.infer<typeof collectionConfigParser>;
export type ContentConfig = z.infer<typeof contentConfigParser> & {
    digest?: string;
};
type EntryInternal = {
    rawData: string | undefined;
    filePath: string;
};
export declare function parseEntrySlug({ id, collection, generatedSlug, frontmatterSlug, }: {
    id: string;
    collection: string;
    generatedSlug: string;
    frontmatterSlug?: unknown;
}): string;
export declare function getEntryDataAndImages<TInputData extends Record<string, unknown> = Record<string, unknown>, TOutputData extends TInputData = TInputData>(entry: {
    id: string;
    collection: string;
    unvalidatedData: TInputData;
    _internal: EntryInternal;
}, collectionConfig: CollectionConfig, shouldEmitFile: boolean, experimentalSvgEnabled: boolean, pluginContext?: PluginContext): Promise<{
    data: TOutputData;
    imageImports: Array<string>;
}>;
export declare function getEntryData(entry: {
    id: string;
    collection: string;
    unvalidatedData: Record<string, unknown>;
    _internal: EntryInternal;
}, collectionConfig: CollectionConfig, shouldEmitFile: boolean, experimentalSvgEnabled: boolean, pluginContext?: PluginContext): Promise<Record<string, unknown>>;
export declare function getContentEntryExts(settings: Pick<AstroSettings, 'contentEntryTypes'>): string[];
export declare function getDataEntryExts(settings: Pick<AstroSettings, 'dataEntryTypes'>): string[];
export declare function getEntryConfigByExtMap<TEntryType extends ContentEntryType | DataEntryType>(entryTypes: TEntryType[]): Map<string, TEntryType>;
export declare function getSymlinkedContentCollections({ contentDir, logger, fs, }: {
    contentDir: URL;
    logger: Logger;
    fs: typeof fsMod;
}): Promise<Map<string, string>>;
export declare function reverseSymlink({ entry, symlinks, contentDir, }: {
    entry: string | URL;
    contentDir: string | URL;
    symlinks?: Map<string, string>;
}): string;
export declare function getEntryCollectionName({ contentDir, entry, }: Pick<ContentPaths, 'contentDir'> & {
    entry: string | URL;
}): string | undefined;
export declare function getDataEntryId({ entry, contentDir, collection, }: Pick<ContentPaths, 'contentDir'> & {
    entry: URL;
    collection: string;
}): string;
export declare function getContentEntryIdAndSlug({ entry, contentDir, collection, }: Pick<ContentPaths, 'contentDir'> & {
    entry: URL;
    collection: string;
}): {
    id: string;
    slug: string;
};
export declare function getEntryType(entryPath: string, paths: Pick<ContentPaths, 'config' | 'contentDir'>, contentFileExts: string[], dataFileExts: string[]): 'content' | 'data' | 'config' | 'ignored';
export declare function safeParseFrontmatter(source: string, id?: string): import("@astrojs/markdown-remark").ParseFrontmatterResult;
/**
 * The content config is loaded separately from other `src/` files.
 * This global observable lets dependent plugins (like the content flag plugin)
 * subscribe to changes during dev server updates.
 */
export declare const globalContentConfigObserver: ContentObservable;
export declare function hasAnyContentFlag(viteId: string): boolean;
export declare function hasContentFlag(viteId: string, flag: (typeof CONTENT_FLAGS)[number]): boolean;
export declare function isDeferredModule(viteId: string): boolean;
export declare function autogenerateCollections({ config, settings, fs, }: {
    config?: ContentConfig;
    settings: AstroSettings;
    fs: typeof fsMod;
}): Promise<ContentConfig | undefined>;
export declare function reloadContentConfigObserver({ observer, ...loadContentConfigOpts }: {
    fs: typeof fsMod;
    settings: AstroSettings;
    viteServer: ViteDevServer;
    observer?: ContentObservable;
}): Promise<void>;
type ContentCtx = {
    status: 'init';
} | {
    status: 'loading';
} | {
    status: 'does-not-exist';
} | {
    status: 'loaded';
    config: ContentConfig;
} | {
    status: 'error';
    error: Error;
};
type Observable<C> = {
    get: () => C;
    set: (ctx: C) => void;
    subscribe: (fn: (ctx: C) => void) => () => void;
};
export type ContentObservable = Observable<ContentCtx>;
export declare function contentObservable(initialCtx: ContentCtx): ContentObservable;
export type ContentPaths = {
    contentDir: URL;
    assetsDir: URL;
    typesTemplate: URL;
    virtualModTemplate: URL;
    config: {
        exists: boolean;
        url: URL;
    };
};
export declare function getContentPaths({ srcDir, legacy }: Pick<AstroConfig, 'root' | 'srcDir' | 'legacy'>, fs?: typeof fsMod): ContentPaths;
/**
 * Check for slug in content entry frontmatter and validate the type,
 * falling back to the `generatedSlug` if none is found.
 */
export declare function getEntrySlug({ id, collection, generatedSlug, contentEntryType, fileUrl, fs, }: {
    fs: typeof fsMod;
    id: string;
    collection: string;
    generatedSlug: string;
    fileUrl: URL;
    contentEntryType: Pick<ContentEntryType, 'getEntryInfo'>;
}): Promise<string>;
export declare function getExtGlob(exts: string[]): string;
export declare function hasAssetPropagationFlag(id: string): boolean;
export declare function globWithUnderscoresIgnored(relContentDir: string, exts: string[]): string[];
/**
 * Convert a platform path to a posix path.
 */
export declare function posixifyPath(filePath: string): string;
/**
 * Unlike `path.posix.relative`, this function will accept a platform path and return a posix path.
 */
export declare function posixRelative(from: string, to: string): string;
export declare function contentModuleToId(fileName: string): string;
export {};
