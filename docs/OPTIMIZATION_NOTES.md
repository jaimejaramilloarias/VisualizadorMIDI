# Endurecimiento del motor visual

## Invariantes

- Web Audio es el reloj autoritativo cuando hay audio; sin audio, el transporte
  usa `performance.now()`.
- El mapa de sincronía se normaliza una vez por cambio de anclas y se consulta
  mediante búsqueda binaria.
- El Worker extrapola el reloj entre correcciones periódicas de la UI.
- En pausa, el Worker renderiza únicamente cuando cambia el tiempo, el tamaño o
  la configuración. Durante reproducción mantiene su bucle independiente.
- El canvas se limpia con un color sólido; no hay rejilla, marcador vertical ni
  composición de imágenes de fondo.
- `Adaptativa`, `Alta` y `Máxima` tienen presupuestos de 10, 16 y 24 megapíxeles.
  La escala puede bajar de 1 en superficies muy grandes para evitar presión
  excesiva de memoria.
- El puente mide el intervalo mediano de `requestAnimationFrame`; el Worker
  adopta esa frecuencia como objetivo sin omitir cuadros deliberadamente.

## Optimizaciones verificables

- Mensajes consecutivos de ajustes y apariencia se agrupan por fotograma.
- Redimensiones subpíxel duplicadas no reconstruyen el canvas.
- La selección de notas visibles usa búsqueda binaria y corta pronto el índice
  de notas largas.
- La telemetría cuenta únicamente instrumentos habilitados.
- El modo adaptativo reduce densidad de píxeles antes de sacrificar fluidez y
  conserva una escala mínima de alta definición.
- Reproducir y pausar mientras `AudioContext` se reactiva no puede iniciar una
  fuente obsoleta.

## Cobertura

- 21 pruebas V2 para MIDI, configuración, sincronía, transporte y matemáticas de
  render.
- 51 archivos de regresión de V1 para conservar todas las funciones migradas.
- Compilación TypeScript y bundle de producción como condición de entrega.
