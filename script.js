// Script inicial para preparar el canvas
// En esta etapa no se implementa funcionalidad adicional

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('visualizer');
  const ctx = canvas.getContext('2d');

  // Relleno inicial del canvas como marcador de posición
  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
});
