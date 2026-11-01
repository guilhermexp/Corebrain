"use strict";

const { app, BrowserWindow } = require("electron");

const donos = new Map();

function exigirDono(ownerId) {
  if (typeof ownerId !== "string" || !ownerId) throw new Error("dono da janela invalido");
  return ownerId;
}

function exigirJanela(windowId) {
  if (!Number.isInteger(windowId)) throw new Error("janela do vault invalida");
  const win = BrowserWindow.fromId(windowId);
  if (!win || win.isDestroyed()) throw new Error("janela do vault indisponivel");
  return win;
}

function retain(ownerId, windowId) {
  const id = exigirDono(ownerId);
  const win = exigirJanela(windowId);
  release(id);
  const flag = { quitting: false };
  const onBeforeQuit = () => {
    flag.quitting = true;
  };
  const onClose = (event) => {
    if (flag.quitting) return;
    const atual = BrowserWindow.fromId(windowId);
    if (!atual || atual.isDestroyed()) return;
    if (typeof event?.preventDefault !== "function") throw new Error("evento de fechar sem preventDefault");
    event.preventDefault();
    atual.hide();
  };
  const onActivate = () => {
    flag.quitting = false;
    const atual = BrowserWindow.fromId(windowId);
    if (!atual || atual.isDestroyed()) return;
    atual.show();
  };
  app.on("before-quit", onBeforeQuit);
  win.on("close", onClose);
  app.on("activate", onActivate);
  donos.set(id, { windowId, onClose, onBeforeQuit, onActivate });
}

function release(ownerId) {
  if (typeof ownerId !== "string" || !ownerId) return false;
  const rec = donos.get(ownerId);
  if (!rec) return false;
  donos.delete(ownerId);
  const win = BrowserWindow.fromId(rec.windowId);
  if (win && !win.isDestroyed()) win.removeListener("close", rec.onClose);
  app.removeListener("before-quit", rec.onBeforeQuit);
  app.removeListener("activate", rec.onActivate);
  return true;
}

module.exports = { retain, release };
