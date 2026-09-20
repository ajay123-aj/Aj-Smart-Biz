'use strict';

/**
 * Every route the API actually has, read off the Express router at boot.
 *
 * The alternative was an `@openapi` block above each of a hundred-odd routes,
 * and the problem with that is not the typing — it is that nothing checks it. A
 * route added without a block is simply undocumented, a route deleted leaves
 * its block behind, and the spec quietly becomes a description of an API that
 * no longer exists. Nobody notices, because a document cannot fail.
 *
 * Reading the router instead makes coverage a property of the system rather
 * than of somebody's diligence: if it is mounted it is documented, the moment
 * it is mounted. What the scan cannot know — what an endpoint is *for* — is
 * layered on top from the JSDoc blocks, which is the half prose is actually
 * good at. See `openapi.js`, which merges the two with prose winning.
 *
 * This walks Express's internal `_router` stack, which is not a public API.
 * That is a real cost and worth stating plainly: it can break on a major
 * Express upgrade. It is contained to this file, everything it produces is
 * additive to a document that is still valid without it, and `scanRoutes`
 * returns an empty object rather than throwing if the internals move — so the
 * worst case is a thinner page, never a server that will not boot.
 */

const logger = require('../utils/logger');

/**
 * Turns a layer's mount regexp back into the path it was mounted at.
 *
 * Express keeps the mount path only as a compiled regexp, so this reverses the
 * few shapes it generates. `fast_slash` marks a router mounted at `/`, which
 * contributes nothing to the path.
 */
function mountPathOf(layer) {
  if (layer.regexp?.fast_slash) return '';

  const source = layer.regexp?.source;
  if (typeof source !== 'string') return '';

  const match = /^\^\\\/(.*?)\\\/\?\(\?=\\\/\|\$\)\$?$/.exec(source);
  if (!match) return '';

  // Escaped literals come back as `\/`; parameters as `(?:([^\/]+?))`.
  return `/${match[1].replace(/\\\//g, '/').replace(/\(\?:\(\[\^\\\/\]\+\?\)\)/g, ':param')}`;
}

/** `/company/:id/branches` -> `/company/{id}/branches`, which is what OpenAPI wants. */
const toOpenApiPath = (path) => path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');

/** The `{id}`-style names in a path, in order. */
const paramsOf = (path) => [...path.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]);

/**
 * Walks a router's stack, depth first, accumulating the prefix as it descends.
 * `out` is a flat list of `{ method, path }`.
 */
function walk(stack, prefix, out, depth = 0) {
  // A router cannot legitimately nest this deep; the guard is against a cycle.
  if (!Array.isArray(stack) || depth > 12) return;

  stack.forEach((layer) => {
    if (layer.route) {
      const path = `${prefix}${layer.route.path === '/' ? '' : layer.route.path}` || '/';
      Object.keys(layer.route.methods ?? {})
        .filter((method) => method !== '_all')
        .forEach((method) => out.push({ method, path }));
      return;
    }

    if (layer.name === 'router' && layer.handle?.stack) {
      walk(layer.handle.stack, `${prefix}${mountPathOf(layer)}`, out, depth + 1);
    }
  });
}

/**
 * Which module a path belongs to, and therefore how it is tagged and whether it
 * needs a token. Read from the prefix, because the prefix *is* the module — see
 * `modules/index.js`.
 */
function moduleOf(path) {
  if (path.startsWith('/theme')) {
    return { tag: 'Theme', secured: false };
  }
  if (path.startsWith('/website')) {
    return { tag: 'Website', secured: false };
  }
  if (path.startsWith('/super-admin')) {
    return { tag: 'Super Admin', secured: true };
  }
  if (path.startsWith('/admin')) {
    return { tag: 'Admin', secured: true };
  }
  // `/auth` is how you get a token, so it cannot require one.
  return { tag: 'Shared', secured: !path.startsWith('/auth') && path !== '/health' };
}

/** A readable summary from the method and the last meaningful path segment. */
function summarise(method, path) {
  const segments = path.split('/').filter(Boolean).filter((s) => !s.startsWith('{'));
  const subject = segments[segments.length - 1] ?? 'resource';
  const collection = !path.endsWith('}');

  const verbs = {
    get: collection ? 'List' : 'Fetch',
    post: 'Create',
    put: 'Replace',
    patch: 'Update',
    delete: 'Delete',
  };

  return `${verbs[method] ?? method.toUpperCase()} ${subject.replace(/-/g, ' ')}`;
}

/**
 * The scanned half of the document: one entry per mounted route.
 *
 * Deliberately thin. It states what exists, its module, whether it needs a
 * token and what its path parameters are — everything the router actually
 * knows. It does not invent request bodies or response shapes, because the
 * router does not know those, and a guessed schema is worse than none.
 */
function scanRoutes(router) {
  const found = [];

  try {
    walk(router?.stack, '', found);
  } catch (error) {
    logger.warn(`OpenAPI: could not scan the router — ${error.message}`);
    return {};
  }

  const paths = {};

  found.forEach(({ method, path }) => {
    const openApiPath = toOpenApiPath(path);
    const { tag, secured } = moduleOf(path);

    paths[openApiPath] = paths[openApiPath] ?? {};
    paths[openApiPath][method] = {
      tags: [tag],
      summary: summarise(method, openApiPath),
      description:
        '_Discovered from the router. See the module for what it does; ' +
        'request shapes come from this endpoint\'s Joi validator._',
      // An empty array is meaningful in OpenAPI: it overrides the global
      // requirement, which is what makes `/theme` and `/auth` open.
      security: secured ? [{ bearerAuth: [] }] : [],
      parameters: paramsOf(openApiPath).map((name) => ({
        name,
        in: 'path',
        required: true,
        schema: { type: 'string' },
      })),
      responses: {
        200: {
          description: 'Success.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiSuccess' } } },
        },
        400: { $ref: '#/components/responses/ValidationFailed' },
        ...(secured
          ? {
              401: { $ref: '#/components/responses/Unauthorized' },
              403: { $ref: '#/components/responses/Forbidden' },
            }
          : {}),
        404: { $ref: '#/components/responses/NotFound' },
        429: { $ref: '#/components/responses/TooManyRequests' },
      },
    };
  });

  return paths;
}

module.exports = { scanRoutes, mountPathOf, toOpenApiPath };
