/**
 * Kick OAuth 2.1 (Authorization Code + PKCE benzeri basit akış)
 * Resmi dokümantasyon: https://docs.kick.com/getting-started/generating-tokens-oauth2-flow
 */

const crypto = require('crypto');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

class KickAuth {
  constructor() {
    this.clientId = process.env.KICK_CLIENT_ID || '';
    this.clientSecret = process.env.KICK_CLIENT_SECRET || '';
    this.redirectUri = process.env.KICK_REDIRECT_URI || 'http://localhost:3000/auth/callback';
    this.authUrl = 'https://id.kick.com/oauth/authorize';
    this.tokenUrl = 'https://id.kick.com/oauth/token';
    this.scopes = [
      'chat:write',
      'events:subscribe',
      'user:read',
      'channel:read'
    ].join(' ');
  }

  getAuthUrl() {
    if (!this.clientId) return null;

    const state = crypto.randomBytes(16).toString('hex');
    // Not: Tam PKCE için code_challenge da eklenebilir; Kick OAuth 2.1 destekliyor.
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: this.scopes,
      state
    });

    return `${this.authUrl}?${params.toString()}`;
  }

  async exchangeCode(code) {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.redirectUri,
      code
    });

    const data = await this._postForm(this.tokenUrl, body.toString());
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      token_type: data.token_type,
      obtained_at: Date.now()
    };
  }

  async refresh(refreshToken) {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: refreshToken
    });

    const data = await this._postForm(this.tokenUrl, body.toString());
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken,
      expires_in: data.expires_in,
      token_type: data.token_type,
      obtained_at: Date.now()
    };
  }

  loadTokens() {
    const p = path.join(__dirname, '../tokens.json');
    if (fs.existsSync(p)) {
      try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      } catch (_) {}
    }
    if (process.env.KICK_ACCESS_TOKEN) {
      return {
        access_token: process.env.KICK_ACCESS_TOKEN,
        refresh_token: process.env.KICK_REFRESH_TOKEN || ''
      };
    }
    return null;
  }

  _postForm(url, body) {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const lib = u.protocol === 'https:' ? https : http;
      const req = lib.request(
        {
          hostname: u.hostname,
          path: u.pathname + u.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body)
          }
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              if (res.statusCode >= 400) {
                reject(new Error(json.error_description || json.error || data));
              } else {
                resolve(json);
              }
            } catch (e) {
              reject(e);
            }
          });
        }
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}

module.exports = KickAuth;
