'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

/** Sub-folders callers may upload into; anything else is rejected. */
const FOLDERS = ['branch', 'company', 'avatar', 'misc'];

const MIME_EXTENSIONS = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico',
};

const uploadRoot = path.resolve(process.cwd(), config.uploads.dir);

const resolveFolder = (req) => {
  const requested = String(req.params.folder || req.query.folder || 'misc').toLowerCase();
  return FOLDERS.includes(requested) ? requested : 'misc';
};

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const target = path.join(uploadRoot, resolveFolder(req));
    fs.mkdir(target, { recursive: true }, (error) => cb(error, target));
  },
  filename(req, file, cb) {
    // Never trust the client's filename - only its extension, and only a known one.
    const extension = MIME_EXTENSIONS[file.mimetype] || path.extname(file.originalname).toLowerCase() || '.bin';
    const stamp = Date.now().toString(36);
    const random = crypto.randomBytes(6).toString('hex');
    cb(null, `${stamp}-${random}${extension}`);
  },
});

/**
 * `?accept=ico` restricts the upload to real .ico files.
 * Browsers are inconsistent about the MIME type for icons — Chrome sends
 * `image/x-icon`, some send `image/vnd.microsoft.icon`, and plenty send
 * `application/octet-stream` — so the extension is accepted here and the file
 * is confirmed by its magic bytes after it lands (see `assertIcoFile`).
 */
const wantsIcoOnly = (req) => String(req.query.accept || '').toLowerCase() === 'ico';

const ICO_MIMES = new Set(['image/x-icon', 'image/vnd.microsoft.icon', 'image/ico', 'application/octet-stream']);

const fileFilter = (req, file, cb) => {
  if (wantsIcoOnly(req)) {
    const looksLikeIco =
      path.extname(file.originalname).toLowerCase() === '.ico' && ICO_MIMES.has(file.mimetype);
    if (!looksLikeIco) {
      return cb(ApiError.badRequest('The favicon must be an .ico file.'));
    }
    return cb(null, true);
  }

  if (!MIME_EXTENSIONS[file.mimetype]) {
    return cb(ApiError.badRequest(`Unsupported file type "${file.mimetype}". Upload a PNG, JPG, WEBP, GIF, SVG or ICO.`));
  }
  return cb(null, true);
};

/**
 * Confirms the bytes really are an icon: every ICO starts with the header
 * `00 00 01 00`. Anything else is deleted and rejected, so a renamed .exe or
 * .png cannot be stored as a favicon.
 */
function assertIcoFile(filePath) {
  return new Promise((resolve, reject) => {
    fs.open(filePath, 'r', (openError, fd) => {
      if (openError) return reject(openError);
      const buffer = Buffer.alloc(4);
      fs.read(fd, buffer, 0, 4, 0, (readError, bytesRead) => {
        fs.close(fd, () => undefined);
        if (readError) return reject(readError);
        const valid =
          bytesRead === 4 &&
          buffer[0] === 0x00 &&
          buffer[1] === 0x00 &&
          buffer[2] === 0x01 &&
          buffer[3] === 0x00;
        return resolve(valid);
      });
    });
  });
}

const uploader = multer({
  storage,
  fileFilter,
  limits: { fileSize: config.uploads.maxSizeMb * 1024 * 1024, files: 1 },
});

/** Single-file upload under the field name `file`, with multer errors normalised. */
const uploadSingle = (field = 'file') => (req, res, next) => {
  uploader.single(field)(req, res, async (error) => {
    if (error) {
      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          return next(ApiError.badRequest(`File is too large. The limit is ${config.uploads.maxSizeMb} MB.`));
        }
        if (error.code === 'LIMIT_UNEXPECTED_FILE') {
          return next(ApiError.badRequest(`Unexpected field. Send the file as "${field}".`));
        }
        return next(ApiError.badRequest(error.message));
      }
      return next(error);
    }

    // Content check for icons; the file is already on disk at this point.
    if (req.file && wantsIcoOnly(req)) {
      try {
        if (!(await assertIcoFile(req.file.path))) {
          fs.unlink(req.file.path, () => undefined);
          return next(ApiError.badRequest('That file is not a valid .ico icon.'));
        }
      } catch (checkError) {
        fs.unlink(req.file.path, () => undefined);
        return next(checkError);
      }
    }

    return next();
  });
};

/** Public path stored in the database, e.g. /uploads/branch/abc.png */
const toPublicPath = (file) => {
  const relative = path.relative(uploadRoot, file.path).split(path.sep).join('/');
  return `${config.uploads.publicPath}/${relative}`;
};

/**
 * Removes a previously uploaded file. Paths outside the upload root are ignored,
 * so a crafted value can never delete anything else.
 */
function removeUploadedFile(publicPath) {
  if (!publicPath || typeof publicPath !== 'string') return;
  if (!publicPath.startsWith(`${config.uploads.publicPath}/`)) return;

  const relative = publicPath.slice(config.uploads.publicPath.length + 1);
  const absolute = path.resolve(uploadRoot, relative);
  if (!absolute.startsWith(uploadRoot + path.sep)) return;

  fs.unlink(absolute, (error) => {
    if (error && error.code !== 'ENOENT') logger.warn(`Could not remove ${publicPath}: ${error.message}`);
  });
}

module.exports = { uploadSingle, toPublicPath, removeUploadedFile, uploadRoot, FOLDERS };
