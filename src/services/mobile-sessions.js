'use strict';
const crypto = require('node:crypto');
const { AppError } = require('../core/util');
const sha = value => crypto.createHash('sha256').update(String(value)).digest('hex');
// 14/11/2026 (Pedro: o site deslogava sozinho): sessão vale 30 dias, não mais 12 h
const TTL = 30 * 24 * 60 * 60 * 1000;
// Single-owner sessions. Store only the digest of the bearer token.
class MobileSessions {
  constructor(store, auth, config) {
    this.store = store; this.auth = auth; this.config = config;
    store.db.exec(`CREATE TABLE IF NOT EXISTS mobile_sessions (
      token_hash TEXT PRIMARY KEY, credential_stamp TEXT NOT NULL,
      device_name TEXT NOT NULL, created_ms INTEGER NOT NULL, expires_ms INTEGER NOT NULL
    ) STRICT;`);
  }
  stamp() {
    const state = this.auth.read();
    const material = JSON.stringify([this.auth.registeredEmail(), state.password_salt || '',
      state.password_hash || '', state.password_hash ? '' : this.config.loginPassword || '']);
    if (material !== this.cachedMaterial) {
      this.cachedMaterial = material;
      this.cachedStamp = crypto.scryptSync(material, sha('sofia-mobile-v1:' + this.auth.registeredEmail()), 32).toString('hex');
    }
    return this.cachedStamp;
  }
  prune() { this.store.db.prepare('DELETE FROM mobile_sessions WHERE expires_ms <= ?').run(Date.now()); }
  issue(device = 'Sofia App') {
    this.prune();
    this.store.db.exec('DELETE FROM mobile_sessions WHERE token_hash IN (SELECT token_hash FROM mobile_sessions ORDER BY created_ms DESC LIMIT -1 OFFSET 19)');
    const token = crypto.randomBytes(32).toString('base64url');
    const expires = Date.now() + TTL;
    this.store.db.prepare('INSERT INTO mobile_sessions VALUES (?,?,?,?,?)')
      .run(sha(token), this.stamp(), String(device).slice(0, 80), Date.now(), expires);
    return { token, token_type: 'Bearer', expires_at: new Date(expires).toISOString() };
  }
  require(req) {
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(String(req.headers.authorization || ''));
    if (!match) throw new AppError('AUTH_REQUIRED', 'Entre com o e-mail e a senha da Sofia.', 401);
    this.prune();
    const row = this.store.db.prepare('SELECT * FROM mobile_sessions WHERE token_hash=?').get(sha(match[1]));
    if (!row || row.credential_stamp !== this.stamp()) {
      if (row) this.revoke(row);
      throw new AppError('SESSION_EXPIRED', 'Sua sessão expirou. Entre novamente.', 401);
    }
    return row;
  }
  revoke(session) { this.store.db.prepare('DELETE FROM mobile_sessions WHERE token_hash=?').run(session.token_hash); }
  revokeAll() { this.store.db.exec('DELETE FROM mobile_sessions'); }
}
module.exports = { MobileSessions };
