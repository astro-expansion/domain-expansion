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

