function setupHelpMessages() {
  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip hidden';
  document.body.appendChild(tooltip);

  document.querySelectorAll('[data-help]').forEach((el) => {
    const text = el.getAttribute('data-help');
    if (!text) return;

    el.addEventListener('mouseenter', () => {
      tooltip.textContent = text;
      const rect = el.getBoundingClientRect();
      const win = typeof window !== 'undefined' ? window : { scrollX: 0, scrollY: 0 };
      tooltip.style.left = `${rect.left + win.scrollX}px`;
      tooltip.style.top = `${rect.bottom + win.scrollY + 5}px`;
      tooltip.classList.remove('hidden');
    });

    el.addEventListener('mouseleave', () => {
      tooltip.classList.add('hidden');
    });
  });
}

if (typeof module !== 'undefined') {
  module.exports = { setupHelpMessages };
} else {
  window.help = { setupHelpMessages };
}
