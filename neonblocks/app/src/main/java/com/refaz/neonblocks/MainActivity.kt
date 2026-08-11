package com.refaz.neonblocks

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.FrameLayout
import android.widget.LinearLayout
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.google.android.gms.ads.MobileAds
import com.google.android.ump.ConsentInformation
import com.google.android.ump.ConsentRequestParameters
import com.google.android.ump.UserMessagingPlatform

/**
 * Single-activity host: loads the HTML5 game from assets into a WebView, shows
 * an AdMob banner beneath it, and bridges the game's JS to native ads + billing.
 */
class MainActivity : Activity() {

    private lateinit var webView: WebView
    private lateinit var ads: AdsManager
    private lateinit var billing: BillingManager
    private lateinit var consentInformation: ConsentInformation
    @Volatile private var adsInitialized = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // --- DIAGNOSTIC CRASH-CATCHER (temporary) ---------------------------
        // Persist any uncaught crash so its exact reason can be shown on the
        // next launch instead of the app just "keeps stopping".
        val prevHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { t, e ->
            try {
                val sw = java.io.StringWriter()
                e.printStackTrace(java.io.PrintWriter(sw))
                openFileOutput("last_crash.txt", MODE_PRIVATE).use {
                    it.write(sw.toString().toByteArray())
                }
            } catch (_: Throwable) { }
            prevHandler?.uncaughtException(t, e)
        }
        // If we crashed last time, show the reason instead of relaunching.
        val crashFile = getFileStreamPath("last_crash.txt")
        if (crashFile != null && crashFile.exists()) {
            val txt = try { crashFile.readText() } catch (e: Throwable) { e.toString() }
            crashFile.delete()
            showCrashScreen(txt)
            return
        }
        // Any synchronous launch crash is caught and shown immediately.
        try {
            startApp()
        } catch (t: Throwable) {
            val sw = java.io.StringWriter()
            t.printStackTrace(java.io.PrintWriter(sw))
            showCrashScreen(sw.toString())
        }
    }

    private fun showCrashScreen(report: String) {
        val tv = android.widget.TextView(this)
        tv.setText("SPACE BALA — CRASH REPORT\nScreenshot this whole screen and send it.\n\n" + report)
        tv.setTextColor(0xFFFF6666.toInt())
        tv.setBackgroundColor(0xFF000000.toInt())
        tv.setTextSize(11f)
        tv.setPadding(28, 60, 28, 28)
        tv.setTextIsSelectable(true)
        val scroll = android.widget.ScrollView(this)
        scroll.addView(tv)
        setContentView(scroll)
    }

    private fun startApp() {
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        hideSystemBars()

        // Layout: [ WebView (weight 1) ] over [ banner container ]
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        webView = WebView(this)
        val bannerContainer = FrameLayout(this)

        root.addView(webView, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        root.addView(bannerContainer, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        setContentView(root)

        configureWebView()

        ads = AdsManager(this, bannerContainer)
        billing = BillingManager(applicationContext) { removed ->
            runOnUiThread {
                ads.adsRemoved = removed
                webView.evaluateJavascript("window.NeonBlocks && window.NeonBlocks.onAdsRemovedChanged($removed);", null)
            }
        }

        webView.addJavascriptInterface(GameBridge(), "AndroidBridge")
        webView.loadUrl("file:///android_asset/game/index.html")

        billing.start()
        gatherConsentThenInitAds()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = true
            cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
        }
        webView.setBackgroundColor(0xFF000000.toInt())
        WebView.setWebContentsDebuggingEnabled(false)
    }

    // ---------------- Consent (GDPR/UMP) then Ads init ----------------
    private fun gatherConsentThenInitAds() {
        val params = ConsentRequestParameters.Builder().build()
        consentInformation = UserMessagingPlatform.getConsentInformation(this)
        consentInformation.requestConsentInfoUpdate(this, params, {
            UserMessagingPlatform.loadAndShowConsentFormIfRequired(this) { initAdsOnce() }
        }, { initAdsOnce() })
        // If consent takes too long / not required, ads still init on the callbacks above.
        if (consentInformation.canRequestAds()) initAdsOnce()
    }

    private fun initAdsOnce() {
        if (adsInitialized) return
        adsInitialized = true
        MobileAds.initialize(this) {
            runOnUiThread {
                ads.adsRemoved = billing.adsRemoved
                ads.start()
            }
        }
    }

    // ---------------- JS bridge ----------------
    inner class GameBridge {
        @JavascriptInterface fun isAdsRemoved(): String = billing.adsRemoved.toString()
        @JavascriptInterface fun showBanner() = ads.showBanner()
        @JavascriptInterface fun hideBanner() = ads.hideBanner()
        @JavascriptInterface fun showInterstitial() = ads.showInterstitial()
        @JavascriptInterface fun showRewarded() {
            ads.showRewarded { granted ->
                runOnUiThread {
                    webView.evaluateJavascript("window.NeonBlocks && window.NeonBlocks.onReward($granted);", null)
                }
            }
        }
        @JavascriptInterface fun purchaseRemoveAds() {
            runOnUiThread { billing.launchPurchase(this@MainActivity) }
        }
    }

    // ---------------- Lifecycle / fullscreen ----------------
    private fun hideSystemBars() {
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.hide(WindowInsetsCompat.Type.systemBars())
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    override fun onPause() {
        super.onPause()
        webView.evaluateJavascript("window.NeonBlocks && window.NeonBlocks.onPause();", null)
        webView.onPause()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        webView.evaluateJavascript("window.NeonBlocks && window.NeonBlocks.onResume();", null)
    }

    override fun onDestroy() {
        ads.destroy()
        webView.destroy()
        super.onDestroy()
    }

    @Deprecated("Back handling")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }
}
