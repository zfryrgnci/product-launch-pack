@echo off
REM Generates your Play upload key ONCE. Back up upload-keystore.jks + passwords forever.
cd /d "%~dp0.."
if exist upload-keystore.jks ( echo upload-keystore.jks already exists - aborting. & exit /b 1 )
keytool -genkeypair -v -keystore upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
echo.
echo Created upload-keystore.jks. Copy keystore.properties.EXAMPLE to keystore.properties and fill passwords.
