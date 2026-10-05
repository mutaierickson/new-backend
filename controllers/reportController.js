const reportModel = require('../models/reportModel');
const auditModel = require('../models/auditModel');

async function daily(_req, res) {
  res.json(await reportModel.daily());
}

async function payments(_req, res) {
  res.json(await reportModel.payments());
}

async function sales(req, res) {
  res.json(await reportModel.sales(req.query.period));
}

async function categories(_req, res) {
  res.json(await reportModel.categories());
}

async function cashiers(_req, res) {
  res.json(await reportModel.cashiers());
}

async function profit(_req, res) {
  res.json(await reportModel.profit());
}

async function auditLogs(_req, res) {
  res.json(await auditModel.list());
}

module.exports = { daily, payments, sales, categories, cashiers, profit, auditLogs };
