import type { RewritePayload } from '../../types/public/common.js';
import type { AstroConfig } from '../../types/public/config.js';
import type { RouteData } from '../../types/public/internal.js';
export type FindRouteToRewrite = {
    payload: RewritePayload;
    routes: RouteData[];
    request: Request;
    trailingSlash: AstroConfig['trailingSlash'];
    buildFormat: AstroConfig['build']['format'];
    base: AstroConfig['base'];
};
export interface FindRouteToRewriteResult {
    routeData: RouteData;
    newUrl: URL;
    pathname: string;
}
/**
 * Shared logic to retrieve the rewritten route. It returns a tuple that represents:
 * 1. The new `Request` object. It contains `base`
 * 2.
 */
export declare function findRouteToRewrite({ payload, routes, request, trailingSlash, buildFormat, base, }: FindRouteToRewrite): FindRouteToRewriteResult;
/**
 * Utility function that creates a new `Request` with a new URL from an old `Request`.
 *
 * @param newUrl The new `URL`
 * @param oldRequest The old `Request`
 */
export declare function copyRequest(newUrl: URL, oldRequest: Request): Request;
export declare function setOriginPathname(request: Request, pathname: string): void;
export declare function getOriginPathname(request: Request): string;
