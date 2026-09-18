import {
  FREE_SCAN_LIMITS,
  PRO_SCAN_LIMITS,
  type ScanLimits,
} from "./catalog-scan.server";
import { hasPaidProSubscription } from "./partner-api.server";

type AdminClient = {
  graphql: (query: string, options?: Record<string, unknown>) => Promise<Response>;
};

export type PlanKey = "free" | "pro";

export type ShopEntitlement = {
  plan: PlanKey;
  source: "free-default" | "preview" | "shopify-app-pricing";
  limits: ScanLimits;
  features: {
    savedHistory: boolean;
    changeDetection: boolean;
    automaticMonitoring: boolean;
    healthAlerts: boolean;
    scheduledReports: boolean;
    reportExports: boolean;
    imageReadinessMonitoring: boolean;
  };
};

const FREE_FEATURES = Object.freeze({
  savedHistory: false,
  changeDetection: false,
  automaticMonitoring: false,
  healthAlerts: false,
  scheduledReports: false,
  reportExports: false,
  imageReadinessMonitoring: false,
});

const PRO_FEATURES = Object.freeze({
  savedHistory: true,
  changeDetection: true,
  automaticMonitoring: true,
  healthAlerts: true,
  scheduledReports: true,
  reportExports: true,
  imageReadinessMonitoring: true,
});

function previewShops() {
  return new Set(
    String(process.env.PAL_PRO_PREVIEW_SHOPS || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

function proEntitlement(source: ShopEntitlement["source"]): ShopEntitlement {
  return {
    plan: "pro",
    source,
    limits: PRO_SCAN_LIMITS,
    features: PRO_FEATURES,
  };
}

function freeEntitlement(): ShopEntitlement {
  return {
    plan: "free",
    source: "free-default",
    limits: FREE_SCAN_LIMITS,
    features: FREE_FEATURES,
  };
}

export async function getEntitlementForShop(
  shop: string,
  admin?: AdminClient,
): Promise<ShopEntitlement> {
  const normalized = String(shop || "").trim().toLowerCase();

  if (normalized && previewShops().has(normalized)) {
    return proEntitlement("preview");
  }

  if (admin && (await hasPaidProSubscription(admin))) {
    return proEntitlement("shopify-app-pricing");
  }

  return freeEntitlement();
}
