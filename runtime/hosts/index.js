/**
 * runtime/hosts/index.js
 * Host Integration Adapters Module Facade (§F9.2).
 */

const contracts = require('./contracts');
const { HostDriver, TOOL_NORMALIZATION_MAP } = require('./driver');
const { AntigravityHostAdapter } = require('./antigravity');

module.exports = {
  ...contracts,
  HostDriver,
  TOOL_NORMALIZATION_MAP,
  AntigravityHostAdapter
};
