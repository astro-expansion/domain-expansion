# `@domain-expansion/astro`

This is an [Astro integration](https://docs.astro.build/en/guides/integrations-guide/) that Expands the Domain!

_It adds Incremental Builds to Astro projects._

## Usage

### Installation

Install the integration **automatically** using the Astro CLI:

```bash
pnpm astro add @domain-expansion/astro
```

```bash
npx astro add @domain-expansion/astro
```

```bash
yarn astro add @domain-expansion/astro
```

Or install it **manually**:

1. Install the required dependencies

```bash
pnpm add @domain-expansion/astro
```

```bash
npm install @domain-expansion/astro
```

```bash
yarn add @domain-expansion/astro
```

2. Add the integration to your astro config

```diff
+import domainExpansion from "@domain-expansion/astro";

export default defineConfig({
  integrations: [
+    domainExpansion(),
  ],
});
```

## Contributing

This package is structured as a monorepo:

- `playground` contains code for testing the package
- `package` contains the actual package
- `docs` contains the documentation

Install dependencies using pnpm:

```bash
pnpm i --frozen-lockfile
```

Start the playground and package watcher:

```bash
pnpm playground:dev
```

You can now edit files in `package`. Please note that making changes to those files may require restarting the playground dev server.

## Licensing

[MIT Licensed](https://github.com/astro-expansion/domain-expansion/blob/main/LICENSE). Made with ❤️ by [the Domain Expansion](https://domainexpansion.gg).

## Acknowledgements

- [Luiz Ferraz](https://github.com/Fryuni)
- [Louis Escher](https://github.com/louisescher)
- [Reuben Tier](https://github.com/theotterlord)
