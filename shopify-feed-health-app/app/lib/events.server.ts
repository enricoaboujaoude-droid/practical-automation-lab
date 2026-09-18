export const APP_EVENTS = [
  "app_opened",
  "scan_started",
  "scan_completed",
  "remediation_viewed",
  "pro_monitoring_enabled",
  "pro_monitoring_disabled",
  "pro_report_generated",
  "pro_export_downloaded",
] as const;

export type AppEvent = (typeof APP_EVENTS)[number];

type EventDetails = {
  count?: number;
  score?: number;
  intervalHours?: number;
};

export function trackAppEvent(event: AppEvent, details: EventDetails = {}) {
  const safe = Object.entries(details)
    .map(([key, value]) => `${key}=${Number(value)}`)
    .join(" ");

  console.log(`PAL_SHOPIFY_EVENT event=${event}${safe ? ` ${safe}` : ""}`);
}
