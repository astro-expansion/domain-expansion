import type { HTMLBytes, HTMLString, } from "astro/runtime/server/index.js";
import type { SlotString } from "astro/runtime/server/render/slot.js";
import type { createHeadAndContent, isHeadAndContent } from "astro/runtime/server/render/astro/head-and-content.js";
import type { isRenderTemplateResult, renderTemplate, } from "astro/runtime/server/render/astro/render-template.js";
import type { createRenderInstruction } from "astro/runtime/server/render/instruction.js";
import type { getImage } from "astro:assets";
import type { renderEntry } from 'astro/content/runtime';

type RuntimeInstances = {
  HTMLBytes: typeof HTMLBytes,
  HTMLString: typeof HTMLString,
  SlotString: typeof SlotString,
  createHeadAndContent: typeof createHeadAndContent,
  isHeadAndContent: typeof isHeadAndContent,
  renderTemplate: typeof renderTemplate,
  isRenderTemplateResult: typeof isRenderTemplateResult,
  createRenderInstruction: typeof createRenderInstruction,
  getImage: typeof getImage,
  renderEntry: typeof renderEntry,
}

export const runtime: RuntimeInstances = ((globalThis as any)[Symbol.for('@domain-expansion:astro-runtime-instances')] = {} as RuntimeInstances);

export type MaybePromise<T> = Promise<T> | T;

type Left<T> = { variant: 'left', value: T };
type Right<T> = { variant: 'right', value: T };

export type Either<L, R> = Left<L> | Right<R>;

export namespace Either {
  export function left<T>(value: T): Left<T> {
    return { variant: 'left', value };
  }

  export function right<T>(value: T): Right<T> {
    return { variant: 'right', value };
  }

  export function isLeft<L, R>(either: Either<L, R>): either is Left<L> {
    return either.variant === 'left';
  }

  export function isRight<L, R>(either: Either<L, R>): either is Right<R> {
    return either.variant === 'right';
  }
}

export type Thunk<T> = () => T;

