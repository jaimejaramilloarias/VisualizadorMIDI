# Endurecimiento del motor visual

## Invariantes

- Web Audio es el reloj autoritativo cuando hay audio; sin audio, el transporte
  usa `performance.now()`.
- Las posiciones MIDI se convierten una sola vez desde ticks a segundos mediante
  el mapa de tempo. El render opera únicamente con segundos continuos; no
  cuantiza a pulsos, corcheas ni otra rejilla musical.
- El mapa de sincronía se normaliza una vez por cambio de anclas y se consulta
  mediante búsqueda binaria.
- La UI y el Worker intercambian anclas con tiempo de época común. El Worker
  extrapola cada cuadro entre correcciones sin mezclar orígenes de
  `performance.now()`.
- En pausa, el Worker renderiza únicamente cuando cambia el tiempo, el tamaño o
  la configuración. Durante reproducción mantiene su bucle independiente.
- El canvas se limpia con un color sólido; no hay rejilla, marcador vertical ni
  composición de imágenes de fondo.
- `Adaptativa`, `Alta` y `Máxima` tienen presupuestos de 10, 16 y 24 megapíxeles.
  La escala puede bajar de 1 en superficies muy grandes para evitar presión
  excesiva de memoria.
- El puente mide el intervalo mediano de `requestAnimationFrame`; Auto adopta
  esa frecuencia y los modos 60/30 usan un acumulador estable.

## Optimizaciones verificables

- Mensajes consecutivos de ajustes y apariencia se agrupan por fotograma.
- Redimensiones subpíxel duplicadas no reconstruyen el canvas.
- La selección de notas visibles usa búsqueda binaria y corta pronto el índice
  de notas largas.
- La telemetría cuenta únicamente instrumentos habilitados.
- El modo adaptativo responde rápidamente a cuadros perdidos, reduce densidad
  antes de sacrificar fluidez y la recupera lentamente para evitar oscilaciones.
- El desenfoque de glow tiene un límite seguro para impedir que un ajuste
  extremo monopolice el presupuesto de cuadro.
- Reproducir y pausar mientras `AudioContext` se reactiva no puede iniciar una
  fuente obsoleta.

## Cobertura

- 25 pruebas V2 para MIDI, configuración, sincronía, transporte y matemáticas de
  render.
- 51 archivos de regresión de V1 para conservar todas las funciones migradas.
- Compilación TypeScript y bundle de producción como condición de entrega.
