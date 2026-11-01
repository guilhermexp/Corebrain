# Security

Do not post tokens, model keys, cookies, private notes or exploit details affecting
users in a public issue. Use GitHub's private vulnerability reporting for this
repository when available. If unavailable, first open a minimal issue requesting
a private reporting channel, without sensitive details.

The browser bridge is authenticated, restricted to local IPv4 loopback, and uses
identity-proven handshakes (`protocol: 2`). Keep the pairing token private.
Sensitive secrets (such as the bridge token `corebrain-ponte-token` and the
configured model key `corebrain-modelo-chave`) are stored securely using
Obsidian's `SecretStorage` API (`minAppVersion: 1.11.4`) rather than written in
plain text to `data.json`.

Before sending an authenticated Bearer token, the extension verifies the local
bridge via an HMAC-SHA256 challenge route (`GET /prova`) using a fresh 256-bit
nonce. Both the plugin and extension must be updated together to protocol 2.
Origin checks and CORS restrict bridge callers to authorized browser extension
schemes (including Chrome, Firefox and Safari extension origins `safari-web-extension:`)
and reject arbitrary website origins; they remain supplementary controls
supporting bridge authentication.

Automated cover fetching and Instagram image downloads run over a hardened Node
network client that validates resolved IP addresses via DNS lookup, explicitly
rejecting private, loopback, link-local, carrier-grade NAT and multicast subnets
to protect against SSRF and DNS rebinding attacks. Cover fetching does not
traverse system proxy configurations or authenticate external sessions; covers
are fetched directly from public sources. Untrusted captured Markdown is still
untrusted content; review external links before opening them.
Corebrain does not sign Chrome, Firefox or Safari store submissions as part of
its GitHub ZIP release. Follow the installation guide and verify SHA256SUMS.
Never install packages that ask for the maintainer's cookies or API key.

Release checklist:

1. Run plugin, extension, integration and packaging tests.
2. Build extension packages from source, not an existing personal browser profile.
3. Scan tracked source, the history being published and artifacts for secrets.
4. Verify ZIP contents and hashes, and exclude local settings/backups.
5. Publish only the reviewed commit and its corresponding artifacts.
