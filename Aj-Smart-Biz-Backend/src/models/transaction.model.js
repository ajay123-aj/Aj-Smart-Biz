'use strict';

const { DataTypes } = require('sequelize');
const { TRANSACTION_STATUS, PAYMENT_MODE } = require('../constants');

module.exports = (sequelize) =>
  sequelize.define(
    'Transaction',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      subscriptionId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      planId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      invoiceNo: { type: DataTypes.STRING(50), allowNull: false },
      amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      discount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      taxAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      totalAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      currency: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'INR' },
      paymentMode: {
        type: DataTypes.ENUM(...Object.values(PAYMENT_MODE)),
        allowNull: false,
        defaultValue: PAYMENT_MODE.OTHER,
      },
      paymentReference: { type: DataTypes.STRING(120), allowNull: true },
      status: {
        type: DataTypes.ENUM(...Object.values(TRANSACTION_STATUS)),
        allowNull: false,
        defaultValue: TRANSACTION_STATUS.SUCCESS,
      },
      paidAt: { type: DataTypes.DATE, allowNull: true },
      remarks: { type: DataTypes.TEXT, allowNull: true },
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'transactions',
      indexes: [
        { fields: ['company_id'] },
        { fields: ['subscription_id'] },
        { fields: ['invoice_no'] },
        { fields: ['status'] },
        { fields: ['paid_at'] },
      ],
    }
  );
