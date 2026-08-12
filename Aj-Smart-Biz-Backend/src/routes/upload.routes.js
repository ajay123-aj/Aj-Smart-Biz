'use strict';

const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { created } = require('../utils/response');
const { uploadSingle, toPublicPath, removeUploadedFile, FOLDERS } = require('../middlewares/upload');

/**
 * POST /uploads/:folder   (multipart, field name "file")
 *
 * Returns the stored path plus an absolute URL. Clients persist `path` — it stays
 * valid if the API later moves to another host — and render `url`.
 */
router.post(
  '/:folder',
  uploadSingle('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest('No file was uploaded. Send it as "file".');

    const path = toPublicPath(req.file);
    return created(res, 'File uploaded successfully', {
      path,
      url: `${req.protocol}://${req.get('host')}${path}`,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });
  })
);

/** DELETE /uploads?path=/uploads/branch/abc.png — drops an orphaned upload. */
router.delete(
  '/',
  asyncHandler(async (req, res) => {
    const target = req.query.path;
    if (!target) throw ApiError.badRequest('A "path" query parameter is required');
    removeUploadedFile(String(target));
    return res.json({ success: true, message: 'File removed', data: { path: target } });
  })
);

router.get('/folders', (req, res) =>
  res.json({ success: true, message: 'Upload folders', data: FOLDERS })
);

module.exports = router;
