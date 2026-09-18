# Security

Do not post tokens, model keys, cookies, private notes or exploit details affecting
users in a public issue. Use GitHub's private vulnerability reporting for this
repository when available. If unavailable, first open a minimal issue requesting
a private reporting channel, without sensitive details.

The browser bridge is authenticated and restricted to local IPv4 loopback. Keep
the pairing token private. Website Origin checks and CORS are supplementary
controls, not a replacement for authentication. Untrusted captured Markdown is
still untrusted content; review external links before opening them.

Corebrain does not sign Chrome, Firefox or Safari store submissions as part of
its GitHub ZIP release. Follow the installation guide and verify SHA256SUMS.
Never install packages that ask for the maintainer's cookies or API key.

Release checklist:

1. Run plugin, extension, integration and packaging tests.
2. Build extension packages from source, not an existing personal browser profile.
3. Scan tracked source, the history being published and artifacts for secrets.
4. Verify ZIP contents and hashes, and exclude local settings/backups.
5. Publish only the reviewed commit and its corresponding artifacts.
