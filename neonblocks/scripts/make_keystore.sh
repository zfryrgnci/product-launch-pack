#!/usr/bin/env bash
# Generates your Play upload key ONCE. Keep upload-keystore.jks + its passwords
# forever and backed up — losing it means you can never update the app again.
set -e
cd "$(dirname "$0")/.."
if [ -f upload-keystore.jks ]; then echo "upload-keystore.jks already exists — aborting."; exit 1; fi
keytool -genkeypair -v \
  -keystore upload-keystore.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias upload
echo
echo "Created upload-keystore.jks."
echo "Now copy keystore.properties.EXAMPLE to keystore.properties and fill in your passwords."
