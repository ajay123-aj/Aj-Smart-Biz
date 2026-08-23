'use strict';

const { DataTypes } = require('sequelize');
const { STATUS, STATUS_VALUES, WHATSAPP_TYPE_VALUES } = require('../constants');

/**
 * One WhatsApp number a company publishes, tagged with what it is for.
 *
 * Typed rather than free-form so the website can put the right number on the
 * right button without guessing: the enquiry form reaches the enquiry desk and
 * the header bubble reaches the general line. A type the company left empty
 * falls back to `contact` when the site renders, so filling in one number is
 * enough to get every button working.
 *
 * Rows exist independently of the WhatsApp functionality being granted or
 * switched on — losing a plan must not delete a tenant's phone numbers.
 */
module.exports = (sequelize) =>
  sequelize.define(
    'CompanyWhatsapp',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      /** One of `WHATSAPP_TYPE` — `inquiry`, `contact`, `support`, `orders`. */
      type: { type: DataTypes.ENUM(...WHATSAPP_TYPE_VALUES), allowNull: false },
      /** Digits only, no `+` — WhatsApp's own wa.me format. Defaults to India. */
      countryCode: { type: DataTypes.STRING(6), allowNull: false, defaultValue: '91' },
      /** The subscriber number, digits only; the API strips anything else. */
      number: { type: DataTypes.STRING(20), allowNull: false },
      /** Overrides the type's name on the button, e.g. "Wholesale desk". */
      label: { type: DataTypes.STRING(80), allowNull: true },
      /** Pre-filled into the chat. Empty means WhatsApp opens with a blank box. */
      defaultMessage: { type: DataTypes.STRING(300), allowNull: true },
      sequence: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      status: { type: DataTypes.ENUM(...STATUS_VALUES), allowNull: false, defaultValue: STATUS.ACTIVE },
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'company_whatsapp_numbers',
      indexes: [
        { fields: ['company_id'] },
        { fields: ['type'] },
        { fields: ['status'] },
        { fields: ['sequence'] },
      ],
    }
  );
