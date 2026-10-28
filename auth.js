// ------------------------------------------------------------
// auth.js  -  LOGIN + ROLE CHECKS (no extra npm packages needed)
//
// How it works:
//   1. Student / placement person logs in with username + password.
//   2. Server gives the browser a signed cookie ("session") that says who they are
//      and what their ROLE is. The browser cannot edit it (the signature would break).
//   3. Before every protected route, a small "middleware" checks the cookie + role.
//      Wrong role  ->  403 Forbidden.  Not logged in  ->  401.
// ------------------------------------------------------------
const crypto = require('crypto');

// Secret key used to sign cookies. Set SESSION_SECRET in real use.
// If it is missing we make a random one (everyone is logged out when the server restarts).
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const COOKIE = 'session';
const SESSION_HOURS = 8;

// ---------- passwords ----------
// scrypt is a slow, safe password hash that comes built into Node.
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function checkPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- signed session cookie ----------
const sign = (text) => crypto.createHmac('sha256', SECRET).update(text).digest('hex');

function makeToken(user) {
  const payload = Buffer.from(JSON.stringify({
    id: String(user._id), username: user.username, role: user.role, studentId: user.studentId,
    exp: Date.now() + SESSION_HOURS * 60 * 60 * 1000
  })).toString('base64url');
  return payload + '.' + sign(payload);
}

function readToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  const good = sign(payload);
  if (signature.length !== good.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(good))) return null;   // tampered
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
  return data.exp > Date.now() ? data : null;                                            // expired
}

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function startSession(res, user) {
  res.setHeader('Set-Cookie',
    `${COOKIE}=${makeToken(user)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_HOURS * 3600}`);
}

function endSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

// ---------- middleware ----------

// Runs on every request: if the cookie is valid, remember who the user is in req.user
function loadUser(req, res, next) {
  try {
    req.user = readToken(parseCookies(req.headers.cookie)[COOKIE]);
  } catch (e) {
    req.user = null;
  }
  next();
}

// API routes: must be logged in, and (optionally) have one of the given roles
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Please log in first.' });
  if (roles.length && !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Your account (' + req.user.role + ') is not allowed to do this.' });
  }
  next();
};

// Page routes: same idea, but redirect to the login page instead of sending JSON
const requirePage = (role) => (req, res, next) => {
  if (!req.user) return res.redirect('/login.html');
  if (req.user.role !== role) return res.redirect(homeFor(req.user.role));
  next();
};

const homeFor = (role) => (role === 'placement' ? '/placement' : '/student');

module.exports = {
  hashPassword, checkPassword, startSession, endSession,
  loadUser, requireRole, requirePage, homeFor
};
