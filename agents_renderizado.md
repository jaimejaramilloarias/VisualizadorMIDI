# Plan de optimización de renderizado MIDI

## Objetivo
Mantener una visualización fluida de notas MIDI a 60fps o más, incluso en pantalla completa con supersampling, sin alterar la estructura de la UI existente.

## Estrategia
1. **Estado y cola de eventos**
   - Mantener un mapa `activeNotes` con los datos de cada nota activa (nota, velocidad, tiempo de inicio y fin).
   - Los handlers de MIDI (`noteon`, `noteoff`) solo encolan operaciones en `eventQueue`, colapsando ráfagas repetidas.
   - La cola se procesa únicamente dentro del `requestAnimationFrame`.

2. **Bucle de render único**
   - Implementar `renderLoop(t)` usando `performance.now()` para calcular `dt`.
   - Restringir `dt` entre 8 ms y 32 ms para evitar saltos bruscos.
   - Todas las animaciones, desplazamientos y decaimientos deben basarse en el tiempo (`time-based`).

3. **Batching y límite de operaciones**
   - Procesar la cola en batch, con un máximo de ~200 operaciones por frame para evitar bloqueos.
   - Reutilizar objetos y arrays (object pooling) para minimizar la generación de basura y pausas de GC.

4. **Supersampling adaptable**
   - Calcular la resolución interna como `canvasCSS * devicePixelRatio * S`.
   - Iniciar con `S = 1.25` y ajustar dinámicamente según el rendimiento.
   - Si los frames superan 18 ms, reducir `S` o el límite de operaciones; si son menores a 12 ms, aumentar gradualmente `S` hasta un máximo permitido.

5. **Pantalla completa y cambios de tamaño**
   - Utilizar la Fullscreen API para entrar/salir de pantalla completa y ocultar el cursor.
   - Emplear `ResizeObserver` y detectar cambios de `devicePixelRatio` para recalcular dimensiones y matrices una vez por frame.
   - Alinear a píxel las líneas críticas para evitar parpadeos.

6. **Animaciones basadas en GPU**
   - Usar solo `transform` y `opacity` para la animación de elementos DOM, aplicando `will-change: transform, opacity` y `contain: paint` en contenedores masivos.
   - Evitar `top/left/width/height` y lecturas forzadas de layout en el mismo frame.

7. **Compatibilidad con `prefers-reduced-motion`**
   - Detectar la media query y, si está activa, sustituir las interpolaciones suaves por actualizaciones discretas sin animación continua.

8. **Detección de fallbacks**
   - Priorizar WebGL con MSAA u offscreen framebuffer.
   - Si no está disponible, usar Canvas2D con supersampling.
   - Ajustar el factor de supersampling a valores bajos en dispositivos débiles.

## Tareas
 - [x] Crear estructura de estado central y cola de eventos para `noteOn`/`noteOff`.
 - [x] Implementar bucle `requestAnimationFrame` único con cálculo de `dt` y clamping.
- [x] Procesar eventos en batch con límite configurable por frame.
- [x] Adaptar el renderizado de notas a un sistema `time-based`.
- [x] Convertir ticks a tiempo usando el tempo map del MIDI para evitar asumir un BPM constante.
- [x] Incorporar supersampling basado en `devicePixelRatio` y factor dinámico `S`.
- [x] Ajustar la lógica de pantalla completa y redimensionamiento con `ResizeObserver`.
- [x] Añadir autoajuste de supersampling según tiempos de frame.
- [x] Implementar soporte para `prefers-reduced-motion`.
- [ ] Establecer mecanismos de pooling para objetos/arrays reutilizables.
- [ ] Optimizar handlers MIDI para solo encolar eventos y colapsar ráfagas.
- [ ] Asegurar animaciones basadas en `transform`/`opacity` con `will-change` y `contain`.
- [x] Detectar cambios de `devicePixelRatio` para recalcular resoluciones.
- [ ] Implementar fallback a Canvas2D cuando no haya WebGL/MSAA.
