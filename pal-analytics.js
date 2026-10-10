(() => {
  // Neon is primary. Render remains a rollback target during the production cutover.
  const primary = 'https://br-wild-truth-b2gxc5zl-palevents.compute.c-6.eu-central-1.aws.neon.tech/event';
  const fallback = 'https://pal-feed-auditor-events.onrender.com/event';

  function transmit(endpoint, name) {
    return fetch(endpoint, {
      method: 'POST',
      mode: 'cors',
      cache: 'no-store',
      credentials: 'omit',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: name,
      keepalive: true,
    }).then((response) => {
      if (!response.ok) throw new Error('analytics_endpoint_unavailable');
    });
  }

  function emit(name) {
    if (!name) return;
    transmit(primary, name).catch(() => {
      // A best-effort fallback; no customer payment or authenticated action is retried.
      transmit(fallback, name).catch(() => {});
    });
  }

  const wire = () => {
    emit(document.body?.dataset?.palView || '');
    document.querySelectorAll('[data-pal-event]').forEach((element) => {
      element.addEventListener('click', () => emit(element.dataset.palEvent || ''));
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire, { once: true });
  } else {
    wire();
  }
})();
