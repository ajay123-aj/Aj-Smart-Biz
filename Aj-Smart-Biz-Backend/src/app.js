'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const config = require('./config/env');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middlewares/errorHandler');

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin / curl / Postman requests carry no Origin header.
      if (!origin) return callback(null, true);
      if (config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
  })
);

app.use(morgan(config.isProd ? 'combined' : 'dev'));

/**
 * Uploaded images, served read-only. helmet defaults `Cross-Origin-Resource-Policy`
 * to `same-origin`, which would stop the Angular apps (different port in
 * development) from rendering them, so it is relaxed for this path only.
 * SVG and ICO are sent as downloads-safe: `nosniff` plus a CSP that blocks
 * scripts, so an SVG containing script cannot execute on our origin.
 */
app.use(
  config.uploads.publicPath,
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { 'default-src': ["'none'"], 'img-src': ["'self'"], 'style-src': ["'unsafe-inline'"] },
    },
  }),
  express.static(path.resolve(process.cwd(), config.uploads.dir), {
    maxAge: config.isProd ? '30d' : 0,
    fallthrough: true,
    index: false,
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
  })
);

// Brute-force protection on the two login endpoints.
app.use(
  `${config.apiPrefix}/auth`,
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: config.isProd ? 30 : 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many attempts, please try again later' },
    skip: (req) => !req.path.endsWith('/login'),
  })
);

app.get('/', (req, res) =>
  res.json({ success: true, message: 'Aj Smart Biz API', docs: `${config.apiPrefix}/health` })
);

app.use(config.apiPrefix, routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
