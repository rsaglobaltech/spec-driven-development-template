(function () {
  document.addEventListener('click', async function (e) {
    const btn = e.target.closest('.copy-btn, .copy');
    if (!btn) return;
    const text = btn.dataset.copy || '';
    try {
      await navigator.clipboard.writeText(text);
      const original = btn.textContent;
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(function () {
        btn.textContent = original;
        btn.classList.remove('copied');
      }, 1400);
    } catch {
      btn.textContent = 'Copy manually';
    }
  });
})();
