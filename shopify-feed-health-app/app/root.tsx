import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

const APP_CSS = `
  :root {
    color-scheme: light;
    font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #f6f6f7;
    color: #202223;
  }

  * { box-sizing: border-box; }

  html, body {
    margin: 0;
    min-height: 100%;
    background: #f6f6f7;
  }

  body {
    font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #202223;
  }

  a {
    color: #005bd3;
  }

  .pal-shell {
    min-height: 100vh;
    background: #f6f6f7;
  }

  .pal-topbar {
    position: sticky;
    top: 0;
    z-index: 20;
    background: rgba(246, 246, 247, 0.97);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid #e1e3e5;
  }

  .pal-topbar-inner {
    max-width: 1180px;
    margin: 0 auto;
    padding: 14px 24px;
    display: flex;
    align-items: center;
    gap: 18px;
    justify-content: space-between;
  }

  .pal-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .pal-brand-mark {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    background: #202223;
    color: white;
    display: grid;
    place-items: center;
    font-weight: 800;
    letter-spacing: -0.04em;
    font-size: 13px;
    flex: 0 0 auto;
  }

  .pal-brand-copy {
    min-width: 0;
  }

  .pal-brand-title {
    font-weight: 700;
    font-size: 14px;
    line-height: 1.2;
    white-space: nowrap;
  }

  .pal-brand-subtitle {
    font-size: 12px;
    color: #6d7175;
    margin-top: 2px;
    white-space: nowrap;
  }

  .pal-nav {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .pal-nav-link {
    text-decoration: none;
    color: #4a4a4a;
    font-size: 14px;
    font-weight: 600;
    padding: 8px 11px;
    border-radius: 8px;
    transition: background .15s ease, color .15s ease;
  }

  .pal-nav-link:hover {
    background: #ebebeb;
    color: #202223;
  }

  .pal-nav-link[aria-current="page"] {
    background: #202223;
    color: white;
  }

  .pal-page-wrap {
    max-width: 1180px;
    margin: 0 auto;
    padding: 22px 24px 48px;
  }

  .pal-intro {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 18px;
    margin-bottom: 16px;
  }

  .pal-eyebrow {
    text-transform: uppercase;
    letter-spacing: .08em;
    font-weight: 700;
    font-size: 11px;
    color: #6d7175;
    margin-bottom: 6px;
  }

  .pal-subtitle {
    color: #6d7175;
    max-width: 720px;
    line-height: 1.5;
    font-size: 14px;
    margin: 0;
  }

  .pal-metric-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    margin: 4px 0 16px;
  }

  .pal-metric-card {
    background: #fff;
    border: 1px solid #e1e3e5;
    border-radius: 12px;
    padding: 16px;
    min-width: 0;
  }

  .pal-metric-label {
    color: #6d7175;
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 8px;
  }

  .pal-metric-value {
    font-size: 28px;
    line-height: 1;
    font-weight: 760;
    letter-spacing: -0.03em;
    color: #202223;
  }

  .pal-metric-note {
    color: #6d7175;
    font-size: 12px;
    margin-top: 8px;
    line-height: 1.4;
  }

  .pal-status-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
    margin: 12px 0 4px;
  }

  .pal-panel {
    background: white;
    border: 1px solid #e1e3e5;
    border-radius: 12px;
    padding: 18px;
  }

  .pal-issue-list {
    display: grid;
    gap: 10px;
  }

  .pal-issue-card {
    border: 1px solid #e1e3e5;
    border-radius: 10px;
    padding: 14px 15px;
    background: #fff;
  }

  .pal-issue-head {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }

  .pal-issue-message {
    color: #303030;
    font-size: 14px;
    line-height: 1.5;
  }

  .pal-remediation {
    margin-top: 7px;
    font-size: 13px;
    line-height: 1.5;
    color: #6d7175;
  }

  .pal-form-grid {
    display: grid;
    grid-template-columns: 1.1fr 1fr 1fr auto;
    gap: 12px;
    align-items: end;
  }

  .pal-field {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .pal-field-label {
    font-size: 12px;
    font-weight: 650;
    color: #4a4a4a;
  }

  .pal-control,
  .pal-button {
    min-height: 38px;
    border-radius: 8px;
    border: 1px solid #c9cccf;
    background: #fff;
    color: #202223;
    font: inherit;
  }

  .pal-control {
    padding: 0 11px;
    width: 100%;
  }

  .pal-control:focus,
  .pal-button:focus-visible {
    outline: 2px solid #2c6ecb;
    outline-offset: 1px;
  }

  .pal-button {
    padding: 0 14px;
    font-weight: 650;
    cursor: pointer;
    background: #fff;
  }

  .pal-button:hover {
    background: #f6f6f7;
  }

  .pal-button-primary {
    background: #202223;
    border-color: #202223;
    color: white;
  }

  .pal-button-primary:hover {
    background: #303030;
  }

  .pal-checkline {
    display: inline-flex;
    gap: 9px;
    align-items: center;
    min-height: 38px;
    font-size: 14px;
    font-weight: 560;
    color: #303030;
  }

  .pal-checkline input {
    width: 18px;
    height: 18px;
    accent-color: #202223;
  }

  .pal-meta-strip {
    margin-top: 14px;
    padding: 12px 14px;
    background: #f7f7f8;
    border: 1px solid #e7e7e9;
    border-radius: 9px;
    color: #6d7175;
    font-size: 12px;
    line-height: 1.6;
  }

  .pal-table-wrap {
    width: 100%;
    overflow-x: auto;
    border: 1px solid #e1e3e5;
    border-radius: 10px;
    background: white;
  }

  .pal-table {
    width: 100%;
    border-collapse: collapse;
    min-width: 720px;
    font-size: 13px;
  }

  .pal-table th {
    text-align: left;
    color: #6d7175;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: .04em;
    font-weight: 700;
    padding: 11px 12px;
    background: #fafafa;
    border-bottom: 1px solid #e1e3e5;
    white-space: nowrap;
  }

  .pal-table td {
    padding: 12px;
    border-bottom: 1px solid #f0f0f0;
    vertical-align: top;
    color: #303030;
  }

  .pal-table tbody tr:last-child td {
    border-bottom: none;
  }

  .pal-link-button {
    text-decoration: none;
    color: #005bd3;
    font-weight: 650;
  }

  .pal-report-card {
    border: 1px solid #e1e3e5;
    border-radius: 10px;
    margin-top: 10px;
    background: #fff;
    overflow: hidden;
  }

  .pal-report-card summary {
    cursor: pointer;
    list-style: none;
    font-weight: 680;
    padding: 14px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .pal-report-card summary::-webkit-details-marker { display: none; }

  .pal-report-card summary::after {
    content: "＋";
    color: #6d7175;
    font-size: 18px;
    font-weight: 400;
  }

  .pal-report-card[open] summary::after { content: "−"; }

  .pal-report-body {
    border-top: 1px solid #e1e3e5;
    padding: 14px 16px 16px;
  }

  .pal-empty {
    border: 1px dashed #c9cccf;
    background: #fafafa;
    color: #6d7175;
    border-radius: 10px;
    padding: 18px;
    text-align: center;
    font-size: 13px;
  }

  .pal-actions-row {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    align-items: center;
  }

  @media (max-width: 900px) {
    .pal-topbar-inner {
      align-items: flex-start;
      flex-direction: column;
      padding: 12px 16px;
      gap: 10px;
    }

    .pal-page-wrap {
      padding: 16px 14px 36px;
    }

    .pal-metric-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .pal-form-grid {
      grid-template-columns: 1fr 1fr;
    }
  }

  @media (max-width: 560px) {
    .pal-brand-subtitle { display: none; }

    .pal-nav {
      width: 100%;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
    }

    .pal-nav-link {
      text-align: center;
      font-size: 12px;
      padding: 8px 6px;
    }

    .pal-metric-grid {
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .pal-metric-card {
      padding: 13px;
    }

    .pal-metric-value {
      font-size: 23px;
    }

    .pal-form-grid {
      grid-template-columns: 1fr;
    }

    .pal-intro {
      align-items: flex-start;
      flex-direction: column;
    }
  }
`;

export default function Root() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link rel="stylesheet" href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css" />
        <style>{APP_CSS}</style>
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
