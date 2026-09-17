export const APP_EVENTS = ["app_opened", "scan_started", "scan_completed", "remediation_viewed", "plan_intent"] as const;
export type AppEvent = (typeof APP_EVENTS)[number];

export function trackAppEvent(event: AppEvent, details: { count?: number; score?: number } = {}) {
  const safe = Object.entries(details).map(([key, value]) => `${key}=${Number(value)}`).join(" ");
  console.log(`PAL_SHOPIFY_EVENT event=${event}${safe ? ` ${safe}` : ""}`);
}
