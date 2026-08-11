# Keep the JS <-> native bridge intact (accessed by reflection from WebView JS).
-keepclassmembers class com.refaz.spacebala.MainActivity$GameBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# AdMob / Play Services and Billing keep rules are bundled with the libraries;
# these extra safety rules avoid stripping classes referenced only via manifest.
-keep class com.google.android.gms.ads.** { *; }
-keep class com.google.android.ump.** { *; }
-dontwarn com.google.android.gms.**
