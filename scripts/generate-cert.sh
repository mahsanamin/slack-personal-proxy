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
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$CERT_DIR/server.key" \
  -out "$CERT_DIR/server.cert" \
  -days 365 \
  -subj "/CN=slack-personal-proxy/O=Personal/C=US" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
  2>/dev/null

if [ $? -eq 0 ]; then
  chmod 600 "$CERT_DIR/server.key"
  echo "Done! Certificates saved to $CERT_DIR/"
  echo "  Key:  $CERT_DIR/server.key"
  echo "  Cert: $CERT_DIR/server.cert"
  echo ""
  echo "Set ENABLE_HTTPS=true in .env to use HTTPS."
else
  echo "Failed to generate certificate. Make sure openssl is installed."
  exit 1
fi
