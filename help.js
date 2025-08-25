function setupHelpMessages(devMode) {
  const details = [];
  document.querySelectorAll('[data-help]').forEach((el) => {
    const text = el.getAttribute('data-help');
    if (!text) return;
    const detail = document.createElement('div');
    detail.className = 'help-detail hidden';
    detail.textContent = text;
    el.insertAdjacentElement('afterend', detail);
    details.push(detail);
  });
  const update = () => {
    const show = devMode.isActive();
    details.forEach((d) => d.classList.toggle('hidden', !show));
  };
  devMode.button.addEventListener('click', update);
  update();
}

if (typeof module !== 'undefined') {
  module.exports = { setupHelpMessages };
} else {
  window.help = { setupHelpMessages };
}
