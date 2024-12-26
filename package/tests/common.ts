import { loadFixture } from '@inox-tools/astro-tests/astroFixture';
import { integration, INTEGRATION_NAME } from '../src/integration.js';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import type { AstroInlineConfig } from 'astro';
import { rm } from 'node:fs/promises';
import { clearMetrics, collectMetrics, type CollectedMetrics } from '../src/metrics.js';
import assert from 'node:assert';

export type IntegrationOptions = NonNullable<Parameters<typeof integration>[0]>;
export type Fixture = Awaited<ReturnType<typeof loadFixture>>;
export type ChangeFile = {
	path: string;
	updater: Parameters<Fixture['editFile']>[1];
};

export type ChangesetTest = {
	changes: ChangeFile[];
	metricsAfter: Partial<CollectedMetrics>;
};

type TestOptions = {
	fixtureName: string;
	prefix: string;
	coldMetrics: Partial<CollectedMetrics>;
	hotMetrics: Partial<CollectedMetrics>;
	integrationOptions?: Omit<IntegrationOptions, 'prefix'>;
	testName?: string;
	config?: Omit<AstroInlineConfig, 'root'>;
	/**
	 * Change source files on the test
	 */
	changeFiles?: ChangesetTest[];
};

export async function defineTests(options: TestOptions): Promise<void> {
	const fixture = await loadFixture({
		root: `./fixture/${options.fixtureName}`,
		outDir: `./dist/${options.prefix}`,
	});

	const scenarioName = options.testName || `[${options.fixtureName}] Equivalence check`;

	describe(scenarioName, () => {
		beforeAll(async () => {
			const cachePath = new URL('./node_modules/.domain-expansion', fixture.config.root);
			await rm(cachePath, { force: true, recursive: true });
			const outDir = new URL(`./dist/${options.prefix}`, fixture.config.root);
			await rm(outDir, { force: true, recursive: true });
		});

		// afterAll(async () => {
		//   const cachePath = new URL(
		//     `./node_modules/.domain-expansion/${options.prefix}`,
		//     fixture.config.root,
		//   );
		//   await rm(cachePath, { force: true, recursive: true });
		//   const outDir = new URL(`./dist/${options.prefix}`, fixture.config.root);
		//   await rm(outDir, { force: true, recursive: true });
		//   await fixture.clean();
		// });

		afterEach(() => {
			fixture.resetAllFiles();
		});

		test('all files should be identical', async () => {
			await fixture.build({
				...withoutDomainExpansion(options.config),
				outDir: `./dist/${options.prefix}/normal`,
			});

			const configWithDomainExpansion = withDomainExpansion(options.config, {
				...options.integrationOptions,
				cachePrefix: `${options.prefix}/base`,
			});

			clearMetrics();
			await fixture.build({
				...configWithDomainExpansion,
				outDir: `./dist/${options.prefix}/cold`,
			});
			const coldMetrics = collectMetrics();

			clearMetrics();
			await fixture.build({
				...configWithDomainExpansion,
				outDir: `./dist/${options.prefix}/hot`,
			});
			const hotMetrics = collectMetrics();

			await checkIdenticalFiles(fixture, ['normal', 'cold', 'hot']);

			expect(coldMetrics).toEqual(expect.objectContaining(options.coldMetrics));
			expect(hotMetrics).toEqual(expect.objectContaining(options.hotMetrics));
		});

		const { changeFiles: changesets } = options;

		if (changesets) {
			for (const [index, changeset] of changesets.entries()) {
				const name = changeset.changes.length === 1 ? changeset.changes[0]!.path : index;

				test(`should match normal build after file changes - ${name}`, async () => {
					// Prime cache
					await fixture.build(
						withDomainExpansion(
							{
								...options.config,
								outDir: `./dist/${options.prefix}/changed-cached`,
							},
							{
								...options.integrationOptions,
								cachePrefix: `${options.prefix}/changed-${index}`,
							}
						)
					);

					for (const change of changeset.changes) {
						await fixture.editFile(change.path, change.updater);
					}

					await fixture.build({
						...withoutDomainExpansion(options.config),
						outDir: `./dist/${options.prefix}/changed-normal`,
					});

					clearMetrics();
					await fixture.build(
						withDomainExpansion(
							{
								...options.config,
								outDir: `./dist/${options.prefix}/changed-cached`,
							},
							{
								...options.integrationOptions,
								cachePrefix: `${options.prefix}/changed-${index}`,
							}
						)
					);
					const metrics = collectMetrics();

					await checkIdenticalFiles(fixture, ['changed-normal', 'changed-cached']);
					expect(metrics).toEqual(expect.objectContaining(changeset.metricsAfter));
				});
			}
		}
	});
}

export async function checkIdenticalFiles(
	fixture: Fixture,
	[referenceVariant, ...otherVariants]: [string, string, ...string[]]
): Promise<void> {
	const variantFiles: Record<string, string[]> = {};

	for (const file of await fixture.glob('**')) {
		const match = file.match(/(.+?)\/(.*)/);
		assert.ok(match);

		const [, variant, fileName] = match as [string, string, string];

		if (!variantFiles[variant]) variantFiles[variant] = [];
		variantFiles[variant].push(fileName);
	}

	const referenceFiles = variantFiles[referenceVariant];
	assert.ok(referenceFiles);

	for (const variant of otherVariants) {
		// Arrays can be in different orders
		expect(variantFiles[variant]).toIncludeAllMembers(referenceFiles);
	}

	for (const fileName of referenceFiles) {
		const referenceFile = await fixture.readFile(`${referenceVariant}/${fileName}`);
		for (const variant of otherVariants) {
			const variantFile = await fixture.readFile(`${variant}/${fileName}`);
			expect(variantFile, fileName).toEqual(referenceFile);
		}
	}
}

function withoutDomainExpansion(config: AstroInlineConfig = {}): AstroInlineConfig {
	if (!config.integrations) return config;

	return {
		...config,
		integrations: config.integrations.flat().filter((int) => int && int.name !== INTEGRATION_NAME),
	};
}

function withDomainExpansion(
	config: AstroInlineConfig = {},
	options?: IntegrationOptions
): AstroInlineConfig {
	if (!config.integrations)
		return {
			...config,
			integrations: [integration(options)],
		};

	return {
		...withoutDomainExpansion(config),
		integrations: [...config.integrations, integration(options)],
	};
}
