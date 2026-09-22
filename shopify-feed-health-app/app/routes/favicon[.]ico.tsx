const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#202223"/>
  <text x="32" y="39" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="#fff">PAL</text>
</svg>`;

export const loader = async () =>
  new Response(ICON, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
