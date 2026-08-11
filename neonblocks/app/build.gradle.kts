import java.util.Properties
import java.io.FileInputStream

plugins {
    alias(libs.plugins.android.application)
}

// Optional release signing. If keystore.properties exists at the project root,
// release builds are signed with your upload key; otherwise they fall back to
// the debug key so the project still builds for testing.
val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) load(FileInputStream(keystorePropsFile))
}

android {
    namespace = "com.refaz.neonblocks"
    compileSdk = 36

    defaultConfig {
        // TODO: This is your permanent app identity on Google Play. Change it
        // ONCE before your first upload; it can never change afterwards.
        applicationId = "com.refaz.neonblocks"
        minSdk = 24
        targetSdk = 36
        versionCode = 13
        versionName = "1.0"

        // AdMob App ID (test id by default — replace with your real one for release).
        manifestPlaceholders["admobAppId"] = "ca-app-pub-8054232338509216~9217561765"
    }

    signingConfigs {
        if (keystorePropsFile.exists()) {
            create("release") {
                storeFile = file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            isShrinkResources = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = if (keystorePropsFile.exists()) signingConfigs.getByName("release")
                            else signingConfigs.getByName("debug")
        }
        debug {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlin { jvmToolchain(17) }

    buildFeatures {
        compose = false
        buildConfig = false
        aidl = false
        shaders = false
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.play.services.ads)
    implementation(libs.user.messaging.platform)
    implementation(libs.billing.ktx)

    testImplementation(libs.junit)
}
