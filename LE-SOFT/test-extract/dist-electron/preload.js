"use strict";

// electron/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("electron", {
  createVoucher: (voucher) => import_electron.ipcRenderer.invoke("create-voucher", voucher),
  getLedgers: () => import_electron.ipcRenderer.invoke("get-ledgers"),
  createLedger: (ledger) => import_electron.ipcRenderer.invoke("create-ledger", ledger),
  // Inventory
  getUnits: () => import_electron.ipcRenderer.invoke("get-units"),
  createUnit: (unit) => import_electron.ipcRenderer.invoke("create-unit", unit),
  getStockGroups: () => import_electron.ipcRenderer.invoke("get-stock-groups"),
  createStockGroup: (group) => import_electron.ipcRenderer.invoke("create-stock-group", group),
  getStockItems: () => import_electron.ipcRenderer.invoke("get-stock-items"),
  createStockItem: (item) => import_electron.ipcRenderer.invoke("create-stock-item", item)
});
