# Benchmarks

A benchmark using [`hyperfine`](https://github.com/sharkdp/hyperfine?tab=readme-ov-file). Used for the data we display on [domainexpansion.gg](https://domainexpansion.gg).

## About the results

The current results you find in `.results/` were created on Dec. 26, 2024 on a desktop PC with the following specs:

```
CPU: AMD Ryzen 9 5950X (32) @ 5,05 GHz
RAM: 32GB DDR4 3200MHz
(Storage: PCIE Gen.4 NVME SSD)
```

## Getting Started

First, install [`hyperfine`](https://github.com/sharkdp/hyperfine?tab=readme-ov-file). You can find instructions in their README file. To run this benchmark, you also need to have `git` and Python installed.

Once installed, run the `bench.sh` script in this directory.

### Running specific benchmarks

You can run the script with the `--exclude=...` flag to exclude certain benchmarks. The following values are valid to pass in:

- `astro-docs`
- `starlight`
- `astro.build`
- `studiocms-ui`
- `brutal`
- `zen-browser`

For example, using `./bench.sh --exlude=astro-docs,astro.build` would exclude the two longest benchmarks!

## What we benchmark

We chose 6 open-source Astro projects of varying sizes:

1. [astro.build](https://astro.build), the official Astro website
2. [docs.astro.build](https://docs.astro.build), the Astro docs and probably the biggest Astro-powered repository out there due to its translations
3. [starlight.astro.build](https://starlight.astro.build), the documentation for Starlight to represent mid-scale documentation projects
4. [ui.studiocms.dev](https://ui.studiocms.dev), a small documentation with a lot of MDX components
5. [zen-browser.app](https://zen-browser.app), a small landing page
6. [brutal.elian.codes](https://brutal.elian.codes), a popular Astro theme and rather small project compared to the rest

## How we benchmark

First, all repositories are cloned. Afterwards, we go into the directory and run `astro build` once to populate the asset cache. Afterwards, we run `astro build` 10 times, which is `hyperfine`'s default. Once that is done, we add the `@domain-expansion/astro` integration and run `astro build` another 10 times, each time making sure we remove the cache that is created. Last but certainly not least, we run `astro build` without removing the cache first, yet another 10 times. After all benchmarks have concluded, we move on to the next repository.
