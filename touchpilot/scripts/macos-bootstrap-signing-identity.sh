#!/usr/bin/env bash
set -euo pipefail

IDENTITY_NAME="${TOKI_MACOS_SIGNING_IDENTITY:-Toki Local Development}"
LOGIN_KEYCHAIN="${TOKI_MACOS_SIGNING_KEYCHAIN:-$HOME/Library/Keychains/login.keychain-db}"

has_valid_identity() {
  local identities
  identities="$(security find-identity -v -p codesigning "$LOGIN_KEYCHAIN" 2>/dev/null)"
  [[ "$identities" == *"\"$IDENTITY_NAME\""* ]]
}

if has_valid_identity; then
  echo "Reusing macOS signing identity: $IDENTITY_NAME"
  exit 0
fi

TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/toki-signing.XXXXXX")"
trap 'rm -rf "$TEMP_DIR"' EXIT

CERTIFICATE_PATH="$TEMP_DIR/toki-local-development.pem"
PRIVATE_KEY_PATH="$TEMP_DIR/toki-local-development.key"
PKCS12_PATH="$TEMP_DIR/toki-local-development.p12"
OPENSSL_CONFIG_PATH="$TEMP_DIR/openssl.cnf"
PKCS12_PASSWORD="$(openssl rand -hex 24)"

if security find-certificate -c "$IDENTITY_NAME" "$LOGIN_KEYCHAIN" >/dev/null 2>&1; then
  security find-certificate -p -c "$IDENTITY_NAME" "$LOGIN_KEYCHAIN" > "$CERTIFICATE_PATH"
  security add-trusted-cert \
    -r trustRoot \
    -p codeSign \
    -k "$LOGIN_KEYCHAIN" \
    "$CERTIFICATE_PATH"

  if has_valid_identity; then
    echo "Trusted existing macOS signing identity: $IDENTITY_NAME"
    exit 0
  fi

  echo "A certificate named '$IDENTITY_NAME' exists, but its private key is unavailable." >&2
  echo "Remove that incomplete certificate from the login keychain, then rerun this script." >&2
  exit 1
fi

cat > "$OPENSSL_CONFIG_PATH" <<EOF
[req]
distinguished_name = distinguished_name
x509_extensions = code_signing
prompt = no

[distinguished_name]
CN = $IDENTITY_NAME
O = Toki Local Development

[code_signing]
basicConstraints = critical, CA:true
keyUsage = critical, digitalSignature, keyCertSign
extendedKeyUsage = codeSigning
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always
EOF

openssl req \
  -new \
  -newkey rsa:3072 \
  -nodes \
  -x509 \
  -sha256 \
  -days 3650 \
  -config "$OPENSSL_CONFIG_PATH" \
  -keyout "$PRIVATE_KEY_PATH" \
  -out "$CERTIFICATE_PATH"

openssl pkcs12 \
  -export \
  -inkey "$PRIVATE_KEY_PATH" \
  -in "$CERTIFICATE_PATH" \
  -name "$IDENTITY_NAME" \
  -passout "pass:$PKCS12_PASSWORD" \
  -out "$PKCS12_PATH"

security import "$PKCS12_PATH" \
  -k "$LOGIN_KEYCHAIN" \
  -P "$PKCS12_PASSWORD" \
  -T /usr/bin/codesign \
  -T /usr/bin/security

security add-trusted-cert \
  -r trustRoot \
  -p codeSign \
  -k "$LOGIN_KEYCHAIN" \
  "$CERTIFICATE_PATH"

if ! has_valid_identity; then
  echo "The '$IDENTITY_NAME' certificate was imported but is not a valid code-signing identity." >&2
  exit 1
fi

echo "Created persistent macOS signing identity: $IDENTITY_NAME"
