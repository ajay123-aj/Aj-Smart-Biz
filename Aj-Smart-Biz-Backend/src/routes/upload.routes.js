'use strict';

const fs = require('fs');
const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { created } = require('../utils/response');
const { uploadSingle, toPublicPath, removeUploadedFile, FOLDERS } = require('../middlewares/upload');
const storageService = require('../services/storage.service');
const db = require('../models');
const { AUTH_SCOPE } = require('../constants');

/**
 * Which company an upload is charged to.
 *
 * A company admin or customer: their own company, from the token — never from
 * the request. A super admin uploading on a company's behalf may name it with
 * `?companyId=`; without one the file is unowned until `reconcileCompany`
 * finds the row that uses it.
 */
function chargedCompany(req) {
  if (req.auth?.scope === AUTH_SCOPE.SUPER_ADMIN) {
    const id = Number(req.query.companyId);
    return Number.isInteger(id) && id > 0 ? id : null;
  }
  return req.auth?.companyId ?? null;
}

/**
 * @openapi
 * /uploads/{folder}:
 *   post:
 *     tags: [Uploads]
 *     summary: Upload one image (multipart, field "file")
 *     description: |
 *       Stores the file and returns its public `path` (persist this) and an
 *       absolute `url` (render this).
 *
 *       **Storage limit.** The file is charged to the caller's company and
 *       counted against its storage limit: the company's own
 *       `storageLimitMb` when the super admin has set one, otherwise the
 *       running plan's `storageMb`. An upload that would go over the limit is
 *       deleted and rejected with `400` and `errors[0].reason = "storage_full"`.
 *       Super admins are not limited; they may pass `?companyId=` to charge the
 *       file to a company.
 *     parameters:
 *       - in: path
 *         name: folder
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: companyId
 *         required: false
 *         description: Super admin only — the company to charge the file to.
 *         schema: { type: integer }
 */
router.post(
  '/:folder',
  uploadSingle('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest('No file was uploaded. Send it as "file".');

    const path = toPublicPath(req.file);
    const companyId = chargedCompany(req);

    if (companyId) {
      /* Checked after the file is on disk: multipart gives no trustworthy size
         before then. A file that does not fit is removed straight away. */
      if (req.auth.scope !== AUTH_SCOPE.SUPER_ADMIN) {
        try {
          await storageService.assertCanStore(companyId, req.file.size);
        } catch (error) {
          fs.unlink(req.file.path, () => undefined);
          throw error;
        }
      }

      await storageService.recordFile({
        companyId,
        publicPath: path,
        folder: req.params.folder,
        sizeBytes: req.file.size,
        mimeType: req.file.mimetype,
        uploadedBy: req.auth.scope === AUTH_SCOPE.ADMIN ? req.auth.id : null,
      });
    }

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

    /* A company may only delete its own files. The ledger says whose a file
       is; one charged to another company is refused. */
    if (req.auth.scope !== AUTH_SCOPE.SUPER_ADMIN) {
      const owner = await db.CompanyFile.findOne({ where: { path: String(target) }, attributes: ['companyId'] });
      if (owner && owner.companyId !== req.auth.companyId) {
        throw ApiError.forbidden('That file belongs to another company');
      }
    }

    removeUploadedFile(String(target));
    return res.json({ success: true, message: 'File removed', data: { path: target } });
  })
);

router.get('/folders', (req, res) =>
  res.json({ success: true, message: 'Upload folders', data: FOLDERS })
);

module.exports = router;
