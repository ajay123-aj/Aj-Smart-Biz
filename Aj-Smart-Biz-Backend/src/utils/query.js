'use strict';

const { Op } = require('sequelize');

const MAX_LIMIT = 200;

/** Normalises `?page=&limit=` into safe integers plus a Sequelize offset. */
const getPagination = (query = {}) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const requested = Number.parseInt(query.limit, 10) || 10;
  const limit = Math.min(MAX_LIMIT, Math.max(1, requested));
  return { page, limit, offset: (page - 1) * limit };
};

/** Builds a case-insensitive OR-LIKE clause across the given columns. */
const buildSearch = (search, fields = []) => {
  if (!search || !fields.length) return null;
  const term = `%${String(search).trim()}%`;
  return { [Op.or]: fields.map((field) => ({ [field]: { [Op.like]: term } })) };
};

/** `?sortBy=name&sortOrder=desc`, validated against an allow-list. */
const getSort = (query = {}, allowed = ['created_at'], fallback = [['created_at', 'DESC']]) => {
  const sortBy = query.sortBy;
  if (!sortBy || !allowed.includes(sortBy)) return fallback;
  const sortOrder = String(query.sortOrder || 'asc').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  return [[sortBy, sortOrder]];
};

/** Merges a list of where fragments, dropping empty ones. */
const mergeWhere = (...clauses) =>
  clauses.filter((clause) => clause && Object.keys(clause).length).reduce(
    (acc, clause) => {
      if (clause[Op.or]) {
        acc[Op.and] = [...(acc[Op.and] || []), clause];
      } else {
        Object.assign(acc, clause);
      }
      return acc;
    },
    {}
  );

module.exports = { getPagination, buildSearch, getSort, mergeWhere, Op };
