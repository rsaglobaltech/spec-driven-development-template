(function () {
  const buttons = document.querySelectorAll('.copy');

  buttons.forEach((button) => {
    button.addEventListener('click', async () => {
      const value = button.getAttribute('data-copy') || '';
      try {
        await navigator.clipboard.writeText(value);
        const original = button.textContent;
        button.textContent = 'Copied';
        setTimeout(() => {
          button.textContent = original;
        }, 1200);
      } catch {
        button.textContent = 'Copy manually';
      }
    });
  });
})();
