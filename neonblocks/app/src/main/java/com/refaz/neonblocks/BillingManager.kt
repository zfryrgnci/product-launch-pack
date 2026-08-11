package com.refaz.neonblocks

import android.app.Activity
import android.content.Context
import android.util.Log
import com.android.billingclient.api.*

/**
 * Google Play Billing wrapper for the permanent, non-consumable "Remove Ads"
 * purchase. Persists entitlement locally AND restores it from Play on launch
 * (so a reinstall or new device re-grants it for free).
 */
class BillingManager(
    private val context: Context,
    private val onEntitlementChanged: (Boolean) -> Unit
) : PurchasesUpdatedListener, BillingClientStateListener {

    private val tag = "BillingManager"
    private val prefs = context.getSharedPreferences("sb_prefs", Context.MODE_PRIVATE)
    private var productDetails: ProductDetails? = null

    private val billingClient: BillingClient = BillingClient.newBuilder(context)
        .setListener(this)
        .enablePendingPurchases(
            PendingPurchasesParams.newBuilder().enableOneTimeProducts().build()
        )
        .build()

    var adsRemoved: Boolean
        get() = prefs.getBoolean("ads_removed", false)
        private set(value) {
            prefs.edit().putBoolean("ads_removed", value).apply()
            onEntitlementChanged(value)
        }

    fun start() {
        // Emit the cached value immediately so UI is correct before Play responds.
        onEntitlementChanged(adsRemoved)
        billingClient.startConnection(this)
    }

    override fun onBillingSetupFinished(result: BillingResult) {
        if (result.responseCode == BillingClient.BillingResponseCode.OK) {
            queryProduct()
            restorePurchases()
        }
    }

    override fun onBillingServiceDisconnected() {
        billingClient.startConnection(this)
    }

    private fun queryProduct() {
        val params = QueryProductDetailsParams.newBuilder().setProductList(
            listOf(
                QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(AdConfig.REMOVE_ADS_SKU)
                    .setProductType(BillingClient.ProductType.INAPP)
                    .build()
            )
        ).build()
        billingClient.queryProductDetailsAsync(params) { result, queryResult ->
            val list = queryResult.productDetailsList
            if (result.responseCode == BillingClient.BillingResponseCode.OK && list.isNotEmpty()) {
                productDetails = list[0]
            }
        }
    }

    /** Launches the Play purchase dialog for Remove Ads. */
    fun launchPurchase(activity: Activity) {
        val details = productDetails ?: run { queryProduct(); return }
        val productParams = BillingFlowParams.ProductDetailsParams.newBuilder()
            .setProductDetails(details)
            .build()
        val flowParams = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(listOf(productParams))
            .build()
        billingClient.launchBillingFlow(activity, flowParams)
    }

    fun restorePurchases() {
        val params = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.INAPP).build()
        billingClient.queryPurchasesAsync(params) { result, purchases ->
            if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                var owned = false
                for (p in purchases) if (p.products.contains(AdConfig.REMOVE_ADS_SKU)) { handlePurchase(p); owned = true }
                if (!owned && adsRemoved) { /* keep local grant; do not revoke */ }
            }
        }
    }

    override fun onPurchasesUpdated(result: BillingResult, purchases: MutableList<Purchase>?) {
        if (result.responseCode == BillingClient.BillingResponseCode.OK && purchases != null) {
            for (p in purchases) handlePurchase(p)
        }
    }

    private fun handlePurchase(purchase: Purchase) {
        if (!purchase.products.contains(AdConfig.REMOVE_ADS_SKU)) return
        if (purchase.purchaseState == Purchase.PurchaseState.PURCHASED) {
            if (!purchase.isAcknowledged) {
                val ack = AcknowledgePurchaseParams.newBuilder().setPurchaseToken(purchase.purchaseToken).build()
                billingClient.acknowledgePurchase(ack) { }
            }
            if (!adsRemoved) adsRemoved = true
        }
    }
}
