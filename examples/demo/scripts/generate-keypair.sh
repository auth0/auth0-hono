#!/bin/bash
# Generate a 2048-bit RSA keypair in PKCS#8 format and output as base64-encoded PEM.
#
# Usage: bash scripts/generate-keypair.sh
#
# This script generates a private key suitable for JWT Client Assertion (private_key_jwt).
# Output: AUTH0_CLIENT_ASSERTION_SIGNING_KEY env var line and corresponding public key for Auth0 dashboard.

set -e

TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Generate RSA private key in PKCS#8 format (required by Web Crypto API on Workers)
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$TEMP_DIR/private.pem" 2>/dev/null

# Extract public key for Auth0 dashboard registration
openssl pkey -in "$TEMP_DIR/private.pem" -pubout -out "$TEMP_DIR/public.pem" 2>/dev/null

# Base64-encode the ENTIRE PEM file (markers included), single line, no newlines.
# auth-config.ts base64-decodes this back to the full PEM string and validates it
# starts with "-----BEGIN PRIVATE KEY-----", then passes the PEM to the SDK.
PEM_CONTENT=$(base64 < "$TEMP_DIR/private.pem" | tr -d '\n')
PUBLIC_PEM=$(cat "$TEMP_DIR/public.pem")

echo "Generated RSA 2048-bit keypair (PKCS#8 format)."
echo ""
echo "=== Step 1: Add this to your .env or .dev.vars ==="
echo "AUTH0_CLIENT_ASSERTION_SIGNING_KEY=$PEM_CONTENT"
echo ""
echo "=== Step 2: Register the PUBLIC key in the Auth0 Dashboard ==="
echo "Auth0 Dashboard > Applications > Your App > Credentials tab"
echo "  Under 'Application Authentication', select 'Private Key JWT'"
echo "  Add a credential and paste this PUBLIC key (the private key stays in .env):"
echo ""
echo "$PUBLIC_PEM"
echo ""
echo "(The dashboard never asks for the private key — only the public key/JWKS.)"
echo ""
echo "=== Step 3: Use JWT-CA in this app ==="
echo "  - Remove AUTH0_CLIENT_SECRET from .env so the SDK resolves to private_key_jwt."
echo "  - Keep AUTH0_CLIENT_ASSERTION_SIGNING_ALG matching the credential (default RS256)."
echo ""
echo "Then run: pnpm dev (or pnpm dev:worker)"
echo ""
echo "SECURITY: The private key is stored in plaintext in .env / .dev.vars."
echo "  - Never commit .env or .dev.vars (they are gitignored)."
echo "  - For production, use a secrets manager (e.g. 'wrangler secret put')."
