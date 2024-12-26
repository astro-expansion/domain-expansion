import { createResolver } from 'astro-integration-kit';
import type { RenderDestinationChunk } from 'astro/runtime/server/render/common.js';
import { rootDebug } from './debug.js';
import * as fs from 'node:fs';
import type { AstroFactoryReturnValue } from 'astro/runtime/server/render/astro/factory.js';
import { Either, runtime, type Thunk } from './utils.js';
import type { SSRMetadata } from 'astro';
import type { RenderInstruction } from 'astro/runtime/server/render/instruction.js';
import * as zlib from 'node:zlib';
import { promisify } from 'node:util';
import {
	fsCacheHit,
	fsCacheMiss,
	trackLoadedCompressedData,
	trackLoadedData,
	trackStoredCompressedData,
	trackStoredData,
} from './metrics.js';
import type { ContextTracking } from './contextTracking.js';
import { MemoryCache } from './inMemoryLRU.js';
import murmurHash from 'murmurhash-native';
import { FactoryValueClone } from './factoryValueClone.ts';

const gzip = promisify(zlib.gzip),
	gunzip = promisify(zlib.gunzip);

const NON_SERIALIZABLE_RENDER_INSTRUCTIONS = ['renderer-hydration-script'] satisfies Array<
	RenderInstruction['type']
>;

type SerializableRenderInstruction = Exclude<
	RenderInstruction,
	{
		type: (typeof NON_SERIALIZABLE_RENDER_INSTRUCTIONS)[number];
	}
>;

type ChunkSerializationMap = {
	primitive: { value: string | number | boolean };
	htmlString: { value: string };
	htmlBytes: { value: string };
	slotString: {
		value: string;
		renderInstructions: Array<SerializableRenderInstruction> | undefined;
	};
	renderInstruction: {
		instruction: SerializableRenderInstruction;
	};
	arrayBufferView: {
		value: string;
	};
	response: {
		body: string;
		status: number;
		statusText: string;
		headers: Record<string, string>;
	};
};

type SerializedChunk<K extends keyof ChunkSerializationMap = keyof ChunkSerializationMap> = {
	[T in K]: ChunkSerializationMap[T] & { type: T };
}[K];

type ValueSerializationMap = {
	headAndContent: {
		head: string;
		chunks: SerializedChunk[];
	};
	templateResult: {
		chunks: SerializedChunk[];
	};
	response: ChunkSerializationMap['response'];
};

type SerializedValue<K extends keyof ValueSerializationMap = keyof ValueSerializationMap> = {
	[T in K]: ValueSerializationMap[T] & { type: T };
}[K];

export type PersistedMetadata = Omit<ContextTracking, 'doNotCache' | 'renderingEntry'> & {
	metadata: Omit<SSRMetadata, 'propagators'>;
};

export type SerializedMetadata = Omit<ContextTracking, 'doNotCache' | 'renderingEntry'> & {
	metadata: {
		hasHydrationScript: boolean;
		rendererSpecificHydrationScripts: Array<string>;
		renderedScripts: Array<string>;
		hasDirectives: Array<string>;
		hasRenderedHead: boolean;
		headInTree: boolean;
		extraHead: string[];
	};
};

const debug = rootDebug.extend('file-store');

type ValueThunk = Thunk<AstroFactoryReturnValue>;

type DenormalizationResult<D, N> = {
	denormalized?: D;
	clone: Thunk<N>;
};

export class RenderFileStore {
	private readonly gzippedCache = new MemoryCache<Buffer>(Number.POSITIVE_INFINITY);

	private readonly resolver: ReturnType<typeof createResolver>['resolve'];

	private readonly pending: Array<Promise<void>> = [];

	private knownFiles!: string[];

	public constructor(private readonly cacheDir: string) {
		this.resolver = createResolver(this.cacheDir).resolve;
		fs.mkdirSync(this.cacheDir, { recursive: true });
	}

	public async initialize(): Promise<void> {
		if (fs.existsSync(this.cacheDir)) {
			this.knownFiles = await fs.promises.readdir(this.cacheDir, {
				recursive: true,
				withFileTypes: false,
			});
		} else {
			this.knownFiles = [];
		}

		await Promise.all(
			this.knownFiles.map(async (hash) => {
				try {
					const stored = await fs.promises.readFile(this.resolver(hash));
					this.gzippedCache.storeSync(hash, stored);
				} catch {}
			})
		);
	}

	public async flush(): Promise<void> {
		while (this.pending.length) {
			await Promise.all(this.pending);
		}

		this.gzippedCache.clear();
		this.knownFiles = [];
	}

	public async saveRenderValue(key: string, value: AstroFactoryReturnValue): Promise<ValueThunk> {
		debug('Persisting renderer for ', key);
		const { denormalized, clone } = await RenderFileStore.denormalizeValue(value);

		if (denormalized) {
			this.store(key + ':renderer', denormalized);
		}

		return clone;
	}

	public async loadRenderer(key: string): Promise<ValueThunk | null> {
		try {
			const serializedValue: SerializedValue | null = await this.load(key + ':renderer');

			if (!serializedValue) {
				debug('Renderer cache miss', key);
				fsCacheMiss();
				return null;
			}

			debug('Renderer cache hit', key);
			fsCacheHit();

			return RenderFileStore.normalizeValue(serializedValue);
		} catch {
			debug('Renderer cache miss', key);
			fsCacheMiss();
			return null;
		}
	}

	public saveMetadata(key: string, metadata: PersistedMetadata): void {
		debug('Persisting metadata for ', key);

		const serialized: SerializedMetadata = {
			...metadata,
			metadata: {
				...metadata.metadata,
				hasDirectives: Array.from(metadata.metadata.hasDirectives),
				renderedScripts: Array.from(metadata.metadata.renderedScripts),
				rendererSpecificHydrationScripts: Array.from(
					metadata.metadata.rendererSpecificHydrationScripts
				),
			},
		};

		this.store(key + ':metadata', serialized);
	}

	public async loadMetadata(key: string): Promise<PersistedMetadata | null> {
		try {
			const serializedValue: SerializedMetadata | null = await this.load(key + ':metadata');
			if (!serializedValue) {
				debug('Metadata cache miss', key);
				fsCacheMiss();
				return null;
			}

			debug('Metadata cache hit', key);
			fsCacheHit();

			return {
				...serializedValue,
				metadata: {
					...serializedValue.metadata,
					hasDirectives: new Set(serializedValue.metadata.hasDirectives),
					renderedScripts: new Set(serializedValue.metadata.renderedScripts),
					rendererSpecificHydrationScripts: new Set(
						serializedValue.metadata.rendererSpecificHydrationScripts
					),
				},
			};
		} catch {
			debug('Metadata cache miss', key);
			fsCacheMiss();
			return null;
		}
	}

	public store(cacheKey: string, data: any): void {
		const promise = new Promise<void>((resolve) => {
			setTimeout(async () => {
				try {
					const serializedData = Buffer.isBuffer(data)
						? data
						: Buffer.from(JSON.stringify(data), 'utf-8');
					trackStoredData(serializedData.byteLength);
					const compressedData = await gzip(serializedData, { level: 9 });
					trackStoredCompressedData(compressedData.byteLength);

					const hash = murmurHash.murmurHash64(cacheKey);
					this.gzippedCache.storeSync(hash, compressedData);
					await fs.promises.writeFile(this.resolver(hash), compressedData);
				} catch (err) {
					debug('Failed to persist data', err);
				} finally {
					resolve();
					this.pending.splice(this.pending.indexOf(promise), 1);
				}
			});
		});

		this.pending.push(promise);
	}

	public async load(cacheKey: string, parse = true): Promise<any> {
		const hash = murmurHash.murmurHash64(cacheKey);
		if (!this.knownFiles.includes(hash)) return null;

		const storedData = await this.gzippedCache.load(
			hash,
			async () => await fs.promises.readFile(this.resolver(hash))
		);
		trackLoadedCompressedData(storedData.byteLength);
		const uncompressedData = await gunzip(storedData);
		trackLoadedData(uncompressedData.byteLength);

		return parse ? JSON.parse(uncompressedData.toString('utf-8')) : uncompressedData;
	}

	public static async denormalizeValue(
		value: AstroFactoryReturnValue
	): Promise<DenormalizationResult<SerializedValue, AstroFactoryReturnValue>> {
		if (value instanceof Response) {
			return RenderFileStore.denormalizeResponse(value);
		}

		if (runtime.isHeadAndContent(value)) {
			const chunks = await FactoryValueClone.renderTemplateToChunks(value.content);
			const seminormalChunks = await Promise.all(chunks.map(RenderFileStore.tryDenormalizeChunk));
			const clone = () =>
				runtime.createHeadAndContent(
					value.head,
					FactoryValueClone.renderTemplateFromChunks(chunks)
				);

			return seminormalChunks.every(Either.isRight)
				? {
						clone,
						denormalized: {
							type: 'headAndContent',
							head: value.head.toString(),
							chunks: seminormalChunks.map((right) => right.value),
						},
					}
				: { clone };
		}

		const chunks = await FactoryValueClone.renderTemplateToChunks(value);
		const seminormalChunks = await Promise.all(chunks.map(RenderFileStore.tryDenormalizeChunk));
		const clone = () => FactoryValueClone.renderTemplateFromChunks(chunks);

		return seminormalChunks.every(Either.isRight)
			? {
					clone,
					denormalized: {
						type: 'templateResult',
						chunks: seminormalChunks.map((right) => right.value),
					},
				}
			: { clone };
	}

	private static normalizeValue(value: SerializedValue): ValueThunk {
		switch (value.type) {
			case 'headAndContent': {
				const normalChunks = value.chunks.map(RenderFileStore.normalizeChunk);
				return () =>
					runtime.createHeadAndContent(
						// SAFETY: Astro core is wrong
						new runtime.HTMLString(value.head) as unknown as string,
						FactoryValueClone.renderTemplateFromChunks(normalChunks)
					);
			}
			case 'templateResult': {
				const normalChunks = value.chunks.map(RenderFileStore.normalizeChunk);
				return () => FactoryValueClone.renderTemplateFromChunks(normalChunks);
			}
			case 'response':
				return () => RenderFileStore.normalizeResponse(value);
		}
	}

	private static async tryDenormalizeChunk(
		chunk: RenderDestinationChunk
	): Promise<Either<RenderDestinationChunk, SerializedChunk>> {
		const deno = await RenderFileStore.denormalizeChunk(chunk);
		return deno === null ? Either.left(chunk) : Either.right(deno);
	}

	private static async denormalizeChunk(
		chunk: RenderDestinationChunk
	): Promise<SerializedChunk | null> {
		switch (typeof chunk) {
			case 'string':
			case 'number':
			case 'boolean':
				return {
					type: 'primitive',
					value: chunk,
				};
			case 'object':
				break;
			default:
				debug('Unexpected chunk type', chunk);
				return null;
		}

		if (chunk instanceof runtime.HTMLBytes)
			return {
				type: 'htmlBytes',
				value: Buffer.from(chunk).toString('base64'),
			};

		if (chunk instanceof runtime.SlotString) {
			const instructions = chunk.instructions?.filter(
				RenderFileStore.isSerializableRenderInstruction
			);

			// Some instruction was not serializable
			if (instructions?.length !== chunk.instructions?.length) return null;

			return {
				type: 'slotString',
				value: chunk.toString(),
				renderInstructions: instructions,
			};
		}

		if (chunk instanceof runtime.HTMLString)
			return {
				type: 'htmlString',
				value: chunk.toString(),
			};

		if (chunk instanceof Response) {
			const { denormalized } = await RenderFileStore.denormalizeResponse(chunk);
			return denormalized!;
		}

		if ('buffer' in chunk)
			return {
				type: 'arrayBufferView',
				value: Buffer.from(
					chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength)
				).toString('base64'),
			};

		if (RenderFileStore.isSerializableRenderInstruction(chunk))
			return {
				type: 'renderInstruction',
				instruction: chunk,
			};

		debug('Unexpected chunk type', chunk);
		return null;
	}

	private static normalizeChunk(chunk: SerializedChunk): RenderDestinationChunk {
		/*
    export type RenderDestinationChunk = string | HTMLBytes | HTMLString | SlotString | ArrayBufferView | RenderInstruction | Response;
     */

		switch (chunk.type) {
			case 'primitive': {
				if (chunk.value === undefined) {
					throw new Error('Undefined chunk value');
				}
				return chunk.value as string;
			}
			case 'htmlString':
				return new runtime.HTMLString(chunk.value);
			case 'htmlBytes':
				return new runtime.HTMLBytes(Buffer.from(chunk.value, 'base64'));
			case 'slotString':
				return new runtime.SlotString(
					chunk.value,
					chunk.renderInstructions?.map(RenderFileStore.normalizeRenderInstruction) ?? null
				);
			case 'renderInstruction':
				return RenderFileStore.normalizeRenderInstruction(chunk.instruction);
			case 'arrayBufferView': {
				const buffer = Buffer.from(chunk.value, 'base64');
				return {
					buffer: buffer.buffer,
					byteLength: buffer.length,
					byteOffset: 0,
				};
			}
			case 'response':
				return new Response(chunk.body, {
					headers: chunk.headers,
				});
			default:
				throw new Error(`Unknown chunk type: ${(chunk as any).type}`);
		}
	}

	private static normalizeRenderInstruction(
		instruction: SerializableRenderInstruction
	): RenderInstruction {
		// SAFETY: `createRenderInstruction` uses an overload to handle the types of each render instruction
		//         individually. This breaks when the given instruction can be any of them as no overload
		//         accepts them indistinctivelly. Each individual type matches the output so the following
		//         is valid.
		return runtime.createRenderInstruction(instruction as any);
	}

	private static async denormalizeResponse(
		value: Response
	): Promise<
		DenormalizationResult<SerializedValue<'response'> & SerializedChunk<'response'>, Response>
	> {
		const body = await value.arrayBuffer();
		return {
			denormalized: {
				type: 'response',
				body: Buffer.from(body).toString('base64'),
				status: value.status,
				statusText: value.statusText,
				headers: Object.fromEntries(value.headers.entries()),
			},
			clone: () => new Response(body, value),
		};
	}

	private static normalizeResponse(
		value: SerializedValue<'response'> | SerializedChunk<'response'>
	): Response {
		return new Response(value.body, {
			headers: value.headers,
			status: value.status,
			statusText: value.statusText,
		});
	}

	private static isSerializableRenderInstruction(
		instruction: RenderInstruction
	): instruction is SerializableRenderInstruction {
		return !(NON_SERIALIZABLE_RENDER_INSTRUCTIONS as Array<RenderInstruction['type']>).includes(
			instruction.type
		);
	}
}
