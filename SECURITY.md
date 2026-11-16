# Security policy

Report vulnerabilities privately by email to the address on the site's About page. Please do not open public issues for security problems. Reports are acknowledged within 72 hours.

## Design summary
- **Sensor data never leaves the device** in the web app: the signal pipeline and the model run in plain JavaScript in the browser. The Content-Security-Policy restricts `connect-src` to the site itself, so page code cannot send readings elsewhere.
- **Strict CSP** with per-request nonces and `strict-dynamic`, no `eval` or WebAssembly; `frame-ancestors 'none'`, HSTS preload, COOP, CORP, `nosniff`.
- **Permissions-Policy** allows only the accelerometer and gyroscope (same origin); camera, microphone, geolocation, magnetometer, payment and USB are disabled.
- **Auth**: better-auth sessions (httpOnly, SameSite=Lax, Secure in production); Google OAuth.
- **API keys**: 192-bit random, shown once, stored only as a peppered SHA-256 hash, compared in constant time; per-key rate limits and monthly quotas; a per-IP shield.
- **API input**: JSON only, 2 MB cap, schema-validated (exact window shape, finite bounded numbers, at most 64 windows).
- **CSRF**: cookie-authenticated mutations require a same-origin `Origin`.
- **Supply chain**: CodeQL (TypeScript and Python), gitleaks, npm audit, pip-audit and Dependabot in CI.
