export function sanitizeRequestTarget(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || "/"), "http://localhost");
    return parsed.pathname || "/";
  } catch {
    return "/";
  }
}
