---
title: An actual explanation of what is going on here
---

After reading the Tale of the Three Mages, you might be a little confused, so here's an actual explanation of how
Domain Expansion works under the hood.

## How Astro builds your site

Whenever you run `astro build`, Astro will essentially "request" your components internally and save the
resulting HTML. This is done using a function called `$$createComponent`. This function takes in a callback
(the compiled version of your component) and turns it into an instance of a component. That instance is then called
each time the component is rendered, with your properties, slots and so on.
You can see how this looks internally in the Astro runtime [here](https://live-astro-compiler.vercel.app/):

<!-- prettier-ignore-start -->

```ts
import {
  Fragment,
  render as $$render,
  createAstro as $$createAstro,
  createComponent as $$createComponent,
  renderComponent as $$renderComponent,
  renderHead as $$renderHead,
  maybeRenderHead as $$maybeRenderHead,
  unescapeHTML as $$unescapeHTML,
  renderSlot as $$renderSlot,
  mergeSlots as $$mergeSlots,
  addAttribute as $$addAttribute,
  spreadAttributes as $$spreadAttributes,
  defineStyleVars as $$defineStyleVars,
  defineScriptVars as $$defineScriptVars,
  renderTransition as $$renderTransition,
  createTransitionScope as $$createTransitionScope,
  renderScript as $$renderScript,
} from "astro/runtime/server/index.js";
import Foo from './Foo.astro';
import Bar from './Bar.astro';

const $$stdin = $$createComponent(($$result, $$props, $$slots) => {

return $$render`${$$maybeRenderHead($$result)}<div>
    ${$$renderComponent($$result,'Foo',Foo,{},{"default": () => $$render`
        Domain Expansion
    `,})}
    ${$$renderComponent($$result,'Bar',Bar,{"baz":"tizio"})}
</div>`;
}, '<stdin>', undefined);
export default $$stdin;
```

<!-- prettier-ignore-end -->

You can see how the `$$createComponent` function takes in the callback, which returns a few
template tags, essentially the rendered components.

## Intercepting the build process

When you install Domain Expansion and add the integration, it adds a Vite plugin. This plugin essentially
just wraps the `$$createComponent` function to add extra behavior before and after your component renders.
That extra behavior allows us to cache all information about each use of your component, such that, whenever
it is built again without any changes to the source code, props or slots, we just return the cached content.

The cache is saved in `node_modules/.domain-expansion`.

## What about assets?

Astro has built-in image optimization. That built-in image optimization adds the resulting asset to your build
output based on calls to the [`getImage` function](https://docs.astro.build/en/guides/images/#generating-images-with-getimage).
That function is also used in the [`<Image />`](https://docs.astro.build/en/guides/images/#display-optimized-images-with-the-image--component)
and [`<Picture />`](https://docs.astro.build/en/reference/modules/astro-assets/#picture-)
components. Domain Expansion detects when that function is called and also adds the parameters that the function
was called with to the cache. Whenever we reconstruct a component from the cache, we "replay" all calls to `getImage`
such that the image service is called just as if the component was rendered normally.

## Zero-cost on SSR

Astro builds the server code once for both prerendered and on-demand pages. The prerendered pages are generated
by running the same render code that you'll deploy to your server during build time with the requests for the
pages that should be prerendered. This means that if we simply transform Astro or your own code for bundling it
would also try to save and load caches on the server, adding a lot of code to your deployed bundle and severely
restricting your hosting platforms (by requiring both a Node.js runtime and a writable file-system).

Instead of that approach, Domain Expansion adds minimal code to your bundle. It adds one internal module that is
essentially just this:

```ts
export const domainExpansionComponents = globalThis[{{internal component symbol}}] ?? ((fn) => fn);
export const domainExpansionAssets = globalThis[{{internal assets symbol}}] ?? ((fn) => fn);
```

Then it modifies the definition of Astro's `createComponent` and `getImage` functions:

```ts ins={2-3,6} del={1,5}
function createComponent(...) {
import {domainExpansionComponents as $$domainExpansion} from '<internal module>';
const createComponent = $$domainExpansion(function createComponent(...) {
  ...
}
});
```

```ts ins={1} del={1,5}
export const getImage = async (...) => ...;
import {domainExpansionAssets as $$domainExpansion} from '<internal module>';
export const getImage = $$domainExpansion(async (...) => ...);
```

When your server is running, those wrappers will just return the original functions, so there is no change in behavior
for on-demand pages and the extra code shipped is just those 4 lines (2 definitions and 2 imports) and the wrapping.

During build, the render code runs in the same V8 isolate as the build process. This allows Domain Expansion to set a
different wrapper to be used only during build without shipping that code in the bundle.

### Bundling duplicates implementation

Astro has a bunch of classes and functions exported from `astro/runtime`. The runtime is bundled in the project by Vite.
This means that the instance used in the render code is not the same that an integration can import from `astro/runtime`,
it's the same code but in two modules so `value instanceof RuntimeClass` doesn't work since those are different, albeit
functionally identical, classes. We also need to reconstruct instances of those classes defined inside the bundle when
loading from cache, but again we can't import them.

To solve this problem, Domain Expansion also injects a little bit of extra code sending a reference to the runtime classes
back from the bundle into the build integration while bundle is loaded. The code looks like this:

```ts
import {someRuntimeFunction, SomeRuntimeClass} from 'astro/runtime/something';

Object.assign(
  globalThis[<runtime transfer symbol>] ?? {},
  {someRuntimeFunction, SomeRuntimeClass},
);
```

For this, in the Domain Expansion integration code, we add an empty object to the global scope under a private symbol
and it gets populated with the values from within the bundle.
