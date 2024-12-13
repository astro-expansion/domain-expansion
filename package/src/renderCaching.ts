import type * as Runtime from "astro/compiler-runtime";
import { rootDebug } from "./debug.ts";

type CachedOutput = {
  render: typeof Runtime.render,
  renderComponent: typeof Runtime.renderComponent | undefined,
}

const debug = rootDebug.extend('render-caching');

export const makeCaching = (parentHash: string, render: typeof Runtime.render, renderComponent?: typeof Runtime.renderComponent): CachedOutput => {
  debug('Render caching called with parent hash:', parentHash);

  return {
    render: (template, ...expressions) => {
      debug('$render called with', { template, expressions })
      return render(template, expressions);
    },
    renderComponent: renderComponent
      ? (...args: Parameters<typeof Runtime.renderComponent>) => {
        debug('$renderComponent called with', args)
        return renderComponent(...args);
      }
      : undefined,
  };
}
