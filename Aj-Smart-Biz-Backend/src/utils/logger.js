'use strict';

/* Tiny dependency-free logger with level filtering. */
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const current = process.env.NODE_ENV === 'production' ? LEVELS.info : LEVELS.debug;

const stamp = () => new Date().toISOString();

const write = (level, stream, args) => {
  if (LEVELS[level] > current) return;
  // eslint-disable-next-line no-console
  console[stream](`[${stamp()}] [${level.toUpperCase()}]`, ...args);
};

module.exports = {
  error: (...args) => write('error', 'error', args),
  warn: (...args) => write('warn', 'warn', args),
  info: (...args) => write('info', 'log', args),
  debug: (...args) => write('debug', 'log', args),
};
