const appUrl = String(process.env.PAL_PRO_APP_URL || "").replace(/\/$/, "");
const secret = String(process.env.PAL_PRO_CRON_SECRET || "");

if (!appUrl) {
  throw new Error("PAL_PRO_APP_URL is required.");
}
if (!secret) {
  throw new Error("PAL_PRO_CRON_SECRET is required.");
}

const response = await fetch(`${appUrl}/internal/pro-run`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${secret}`,
    "content-type": "application/json",
  },
});

const body = await response.text();

if (!response.ok) {
  throw new Error(`Pro monitoring endpoint returned ${response.status}: ${body.slice(0, 300)}`);
}

console.log(body);
