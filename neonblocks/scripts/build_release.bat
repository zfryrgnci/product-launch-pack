@echo off
cd /d "%~dp0.."
call gradlew.bat clean bundleRelease assembleRelease
echo.
echo AAB (upload to Play): app\build\outputs\bundle\release\app-release.aab
echo APK (test on phone):  app\build\outputs\apk\release\app-release.apk
