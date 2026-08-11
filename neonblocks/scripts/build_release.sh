#!/usr/bin/env bash
# Builds the signed release AAB (for Play upload) and APK (for sideload testing).
set -e
cd "$(dirname "$0")/.."
./gradlew clean bundleRelease assembleRelease
echo
echo "AAB (upload this to Play):  app/build/outputs/bundle/release/app-release.aab"
echo "APK (test on a phone):      app/build/outputs/apk/release/app-release.apk"
