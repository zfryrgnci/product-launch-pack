# Neon Unravel — Production Build & Publish Guide

A complete, monetization-ready Android game. This document is the honest,
end-to-end path from this folder to a live listing on Google Play.

---

## 0. What's in this project

```
NeonUnravel_Production/
├─ app/src/main/assets/game/   ← the actual game (HTML5 canvas)
│    ├─ core.js                ← pure game logic (also unit-tested headlessly)
│    ├─ game.js                ← rendering, touch input, native ad/IAP bridge
│    └─ index.html
├─ app/src/main/java/com/refaz/neonunravel/
│    ├─ MainActivity.kt         ← WebView host + fullscreen + JS↔native bridge
│    ├─ AdsManager.kt           ← AdMob banner + interstitial + rewarded
│    ├─ BillingManager.kt       ← Play Billing "Remove Ads" (non-consumable)
│    └─ AdConfig.kt             ← ★ the ONLY file you edit to plug in real IDs
├─ app/build.gradle.kts, build.gradle.kts, settings.gradle.kts, gradle/…
├─ tests/game_core_test.js      ← automated crash/perf/rule QA (Node)
├─ web/                         ← standalone browser build (GitHub Pages/itch.io)
├─ scripts/                     ← keystore + release build scripts
├─ store_assets/                ← privacy policy, listing text, 512px icon
└─ keystore.properties.EXAMPLE
```

**Monetization already wired in:**
- AdMob **banner** (adaptive, bottom), **interstitial** (every 2nd game-over),
  **rewarded** (watch-ad-to-revive).
- **Remove Ads** one-time in-app purchase (restores across devices).
- GDPR/UMP **consent** flow before ads load.

Out of the box it uses Google's official **TEST ad IDs** — real-looking test ads,
zero ban risk. You swap in your real IDs in **one file** (`AdConfig.kt`) when ready.

---

## 1. Build & test it right now (free)

You need **Android Studio** (free). Open this folder as a project; it will
download the Android SDK/Gradle bits automatically the first time.

Run the game logic's automated QA any time (needs Node.js, also free):
```
cd tests && node game_core_test.js
```
This simulates **millions of frames** and thousands of full runs, asserting no
crash, no memory growth, and 60fps headroom. It must print `ALL CHECKS PASSED`.

Build a test APK from Android Studio (Run ▶) or:
```
./gradlew assembleDebug      # macOS/Linux
gradlew.bat assembleDebug    # Windows
```

---

## 2. The four things only YOU can do (they need your Google login)

These are genuinely impossible for an automated agent to do for you — they happen
under your identity/payment. Everything else is already done.

**(a) Create a Google Play developer account — one-time $25.**
https://play.google.com/console → sign up.

**(b) Create a free AdMob account and ad units.**
https://admob.google.com → add app "Neon Unravel" → create a Banner, an
Interstitial, and a Rewarded unit. Copy the 4 IDs (App ID + 3 unit IDs).

**(c) Paste your IDs in two spots, flip one switch:**
- `app/src/main/java/com/refaz/neonunravel/AdConfig.kt` → paste the 3 unit IDs into
  `REAL_BANNER / REAL_INTERSTITIAL / REAL_REWARDED`, set `USE_TEST_ADS = false`.
- `app/build.gradle.kts` → `manifestPlaceholders["admobAppId"]` → your real App ID.

**(d) Create the in-app product on Play.**
Play Console → your app → Monetize → Products → In-app products → create one with
product ID **exactly** `remove_ads` (must match `AdConfig.REMOVE_ADS_SKU`).

---

## 3. Sign and build the release (the file you upload)

Generate your upload key **once** (back it up forever — losing it locks you out
of future updates):
```
./scripts/make_keystore.sh        # or scripts\make_keystore.bat on Windows
```
Then copy `keystore.properties.EXAMPLE` → `keystore.properties` and fill in the
passwords/alias you just chose.

Build the signed release:
```
./scripts/build_release.sh        # or scripts\build_release.bat
```
Outputs:
- `app/build/outputs/bundle/release/app-release.aab`  ← **upload this to Play**
- `app/build/outputs/apk/release/app-release.apk`     ← sideload to test on a phone

---

## 4. Publish

1. Play Console → Create app → fill the listing using `store_assets/store_listing.md`.
2. Upload the `.aab` under **Production** (or start with **Internal testing** — faster review).
3. Complete: Privacy policy URL (host `store_assets/privacy_policy.md` on free
   GitHub Pages), Data safety form (answers in the listing file), Content rating,
   Ads declaration (Yes), Target audience.
4. Add 2+ phone screenshots (capture from the running app) and a 1024×500 feature graphic.
5. Submit for review.

---

## 5. Honest notes

- **Test ads pay nothing** — that's by design. Real income starts only after you
  plug in your real AdMob IDs (step 2) and Google reviews your AdMob account.
- **Revenue is never guaranteed.** The code and monetization are done correctly;
  earnings depend on installs and engagement, which come from the store listing,
  screenshots, and any promotion you do. This is a real, sellable game — not a
  money button.
- **Package name `com.refaz.neonunravel` is permanent** once published. Change it in
  `app/build.gradle.kts` (`applicationId`) **before** your first upload if you want
  a different one; never after.
- Keep `upload-keystore.jks`, `keystore.properties`, and their passwords private and
  backed up. They're git-ignored on purpose.
