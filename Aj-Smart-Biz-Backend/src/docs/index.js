'use strict';

/**
 * Serves the API documentation.
 *
 * Mounted inside the API prefix at `/docs`, with the raw document beside it at
 * `/docs.json` — the page is for people, the JSON is for Postman, client
 * generators and anything else that would rather read the spec than the page.
 *
 * `persistAuthorization` keeps a pasted token across reloads, because the
 * alternative is logging in again on every page refresh while trying endpoints,
 * which is how a docs page stops getting used.
 */
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const { openapiSpec } = require('./openapi');

/**
 * @param {import('express').Router} apiRouter The mounted API, for the scan.
 */
module.exports = (apiRouter) => {
  const router = express.Router();
  const spec = openapiSpec(apiRouter);

  router.get('/docs.json', (req, res) => res.json(spec));

  router.use(
    '/docs',
    /**
     * helmet's default CSP blocks the inline styles swagger-ui injects, so it
     * is relaxed for this path and this path only — the rest of the API keeps
     * the strict policy.
     */
    (req, res, next) => {
      res.removeHeader('Content-Security-Policy');
      next();
    },
    swaggerUi.serve,
    swaggerUi.setup(spec, {
      customSiteTitle: 'Aj Smart Biz API',
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'none',
        filter: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
    })
  );

  return router;
};
