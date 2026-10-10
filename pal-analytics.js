(() => {
  const endpoint = 'https://br-wild-truth-b2gxc5zl-palevents.compute.c-6.eu-central-1.aws.neon.tech/event';
  function emit(name) {
    if (!name) return;
    fetch(endpoint, {
      method: 'POST',
      mode: 'cors',
      cache: 'no-store',
      credentials: 'omit',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: name,
      keepalive: true,
    }).catch(() => {});
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