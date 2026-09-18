import {
  FREE_SCAN_LIMITS,
  PRO_SCAN_LIMITS,
  type ScanLimits,
} from "./catalog-scan.server";

export type PlanKey = "free" | "pro";

export type ShopEntitlement = {
  plan: PlanKey;
  source: "free-default" | "preview";
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

export async function getEntitlementForShop(
  shop: string,
): Promise<ShopEntitlement> {
  const normalized = String(shop || "").trim().toLowerCase();

  if (normalized && previewShops().has(normalized)) {
    return {
      plan: "pro",
      source: "preview",
      limits: PRO_SCAN_LIMITS,
      features: PRO_FEATURES,
    };
  }

  return {
    plan: "free",
    source: "free-default",
    limits: FREE_SCAN_LIMITS,
    features: FREE_FEATURES,
  };
}
