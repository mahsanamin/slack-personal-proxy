#!/bin/bash
# Generate a self-signed certificate for HTTPS
# Usage: ./scripts/generate-cert.sh

CERT_DIR="$(cd "$(dirname "$0")/.." && pwd)/certs"
mkdir -p "$CERT_DIR"

if [ -f "$CERT_DIR/server.key" ] && [ -f "$CERT_DIR/server.cert" ]; then
  echo "Certificates already exist in $CERT_DIR"
  echo "Delete them first if you want to regenerate."
  exit 0
fi

echo "Generating self-signed certificate..."

# Use a temp config file for SAN support (works on all OpenSSL versions)
TMPCONF=$(mktemp)
cat > "$TMPCONF" <<CONF
[req]
default_bits = 2048
prompt = no
distinguished_name = dn
x509_extensions = v3_ext

[dn]
CN = slack-personal-proxy
O = Personal
C = US

[v3_ext]
subjectAltName = DNS:localhost,IP:127.0.0.1
CONF

openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$CERT_DIR/server.key" \
  -out "$CERT_DIR/server.cert" \
  -days 365 \
  -config "$TMPCONF" \
  || true
rm -f "$TMPCONF"

if [ -f "$CERT_DIR/server.key" ] && [ -f "$CERT_DIR/server.cert" ]; then
  chmod 644 "$CERT_DIR/server.key" "$CERT_DIR/server.cert"
  echo "Done! Certificates saved to $CERT_DIR/"
  echo "  Key:  $CERT_DIR/server.key"
  echo "  Cert: $CERT_DIR/server.cert"
  echo ""
  echo "Set ENABLE_HTTPS=true in .env to use HTTPS."
else
  echo "Failed to generate certificate. Make sure openssl is installed."
  exit 1
fi
