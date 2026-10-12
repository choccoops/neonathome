import { MODULE_ID, SOCKET_NAME } from "./constants.js";
import { Compat } from "./compat.js";

/**
 * Request/response channel to the active GM, plus broadcast events.
 * GM-side handlers run one at a time so two players can't move the same item twice.
 */
export class HomeSocket {
  static #pending = new Map();
  static #handlers = new Map();
  static #events = new Map();
  static #queue = Promise.resolve();

  static init() {
    game.socket.on(SOCKET_NAME, (msg) => this.#onMessage(msg));
  }

  static register(op, handler) {
    this.#handlers.set(op, handler);
  }

  static on(event, handler) {
    this.#events.set(event, handler);
  }

  /** Send an event to the listed users (or everyone). Runs locally too when this user is listed. */
  static emit(event, payload = {}, userIds = null) {
    const targets = Array.isArray(userIds) ? userIds : null;
    if (!targets || targets.includes(game.user.id)) this.#runEvent(event, payload, game.user);
    const others = targets ? targets.filter((id) => id !== game.user.id) : null;
    if (others && !others.length) return;
    game.socket.emit(SOCKET_NAME, { kind: "event", event, payload, userIds: others, senderId: game.user.id });
  }

  static async request(op, payload, { timeout = 180_000 } = {}) {
    const gm = Compat.activeGM;
    if (!gm) throw new Error(game.i18n.localize("NEONHOME.Error.NoGM"));
    if (gm.isSelf) return this.#run(op, payload, game.user);
    const requestId = foundry.utils.randomID(16);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(requestId);
        reject(new Error(game.i18n.localize("NEONHOME.Error.Timeout")));
      }, timeout);
      this.#pending.set(requestId, { resolve, reject, timer });
      game.socket.emit(SOCKET_NAME, { kind: "request", requestId, op, payload, senderId: game.user.id, gmId: gm.id });
    });
  }

  static #run(op, payload, user) {
    const handler = this.#handlers.get(op);
    if (!handler) return Promise.reject(new Error(`Unknown operation: ${op}`));
    const job = this.#queue.then(() => handler(payload, user));
    this.#queue = job.catch(() => null);
    return job;
  }

  static async #runEvent(event, payload, sender) {
    const handler = this.#events.get(event);
    if (!handler) return;
    try {
      await handler(payload, sender);
    } catch (err) {
      console.error(`${MODULE_ID} | event "${event}" failed`, err);
    }
  }

  static async #onMessage(msg) {
    if (!msg || typeof msg !== "object") return;
    if (msg.kind === "request") {
      if (msg.gmId !== game.user.id) return;
      const user = game.users.get(msg.senderId);
      let reply;
      try {
        if (!user) throw new Error("Unknown user");
        reply = { ok: true, result: await this.#run(msg.op, msg.payload, user) };
      } catch (err) {
        console.warn(`${MODULE_ID} | request "${msg.op}" from ${user?.name} failed:`, err);
        reply = { ok: false, error: err?.message ?? String(err) };
      }
      game.socket.emit(SOCKET_NAME, { kind: "response", requestId: msg.requestId, targetId: msg.senderId, ...reply });
      return;
    }
    if (msg.kind === "response") {
      if (msg.targetId !== game.user.id) return;
      const pending = this.#pending.get(msg.requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.#pending.delete(msg.requestId);
      if (msg.ok) pending.resolve(msg.result);
      else pending.reject(new Error(msg.error));
      return;
    }
    if (msg.kind === "event") {
      if (Array.isArray(msg.userIds) && !msg.userIds.includes(game.user.id)) return;
      await this.#runEvent(msg.event, msg.payload, game.users.get(msg.senderId));
    }
  }
}
