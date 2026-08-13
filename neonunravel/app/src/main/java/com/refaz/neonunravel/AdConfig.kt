package com.refaz.neonunravel

/**
 * ================== THE ONLY FILE YOU EDIT FOR MONETIZATION ==================
 *
 * Out of the box these are Google's OFFICIAL TEST ad unit IDs. They show real
 * test ads immediately and are 100% safe — you will NOT get banned for using
 * them during development.
 *
 * WHEN YOU ARE READY TO EARN REAL MONEY:
 *   1. Create a free AdMob account:  https://admob.google.com
 *   2. Register this app, then create a Banner, an Interstitial, and a
 *      Rewarded ad unit.
 *   3. Replace the four IDs below with your real ones, and set USE_TEST_ADS
 *      to false.
 *   4. Put your real AdMob *App ID* into the manifest placeholder
 *      `admobAppId` in app/build.gradle.kts (defaultConfig.manifestPlaceholders).
 *
 * The IAP product id `remove_ads` must match the in-app product you create in
 * the Google Play Console (Monetize > Products > In-app products).
 * ============================================================================
 */
object AdConfig {

    // Flip to false ONLY after you have pasted your real IDs below.
    const val USE_TEST_ADS = false

    // --- Google official TEST unit ids (safe) ---
    private const val TEST_BANNER = "ca-app-pub-3940256099942544/6300978111"
    private const val TEST_INTERSTITIAL = "ca-app-pub-3940256099942544/1033173712"
    private const val TEST_REWARDED = "ca-app-pub-3940256099942544/5224354917"

    // --- YOUR REAL unit ids (paste here, then set USE_TEST_ADS = false) ---
    private const val REAL_BANNER = "ca-app-pub-8054232338509216/8195636439"
    private const val REAL_INTERSTITIAL = "ca-app-pub-8054232338509216/4012210815"
    private const val REAL_REWARDED = "ca-app-pub-8054232338509216/7759884135"

    val bannerId: String get() = if (USE_TEST_ADS) TEST_BANNER else REAL_BANNER
    val interstitialId: String get() = if (USE_TEST_ADS) TEST_INTERSTITIAL else REAL_INTERSTITIAL
    val rewardedId: String get() = if (USE_TEST_ADS) TEST_REWARDED else REAL_REWARDED

    // Google Play in-app product id for the permanent "Remove Ads" purchase.
    const val REMOVE_ADS_SKU = "remove_ads"
}
