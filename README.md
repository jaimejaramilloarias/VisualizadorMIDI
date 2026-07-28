# MIDI Stage V2

Aplicación web local-first para visualizar archivos MIDI con animación de alta
resolución, audio opcional y sincronización mediante anclas. No exporta video ni
audio: prioriza una reproducción fluida y de calidad directamente en la web.

Los archivos MIDI y de audio se procesan en memoria en el dispositivo. El estado
de la visualización se puede guardar como JSON, pero ese archivo solo contiene
ajustes, nombres de referencia y anclas de tiempo; nunca contiene los medios.

## MVP actual

- Escena horizontal única, sin rejilla ni marcador vertical de reproducción.
- Fondo negro absoluto por defecto, con selector de color sólido.
- Parser MIDI formato 0/1 con mapa de tempo, running status y sustain.
- Parsing y renderizado en Workers.
- `OffscreenCanvas` Retina con resolución `Adaptativa`, `Alta` y `Máxima`.
- FPS `Auto`, `60` o `30`; Auto sigue la frecuencia real de la pantalla.
- Movimiento calculado continuamente en segundos, sin cuantización musical ni
  rejilla temporal.
- NOW centrado horizontalmente, con la misma ventana temporal hacia PAST y
  hacia el futuro.
- Aproximación magnética: las notas aparecen lentamente en la distancia y
  aceleran de forma continua al acercarse a NOW. Cada nota tiene una sola figura
  en pantalla: no se generan copias ni estelas que puedan acumularse allí.
- La extensión dinámica nace en NOW y crece únicamente hacia PAST.
- Glow y bump reaccionan exclusivamente después de cada Note On con pulsos
  rápidos: un halo independiente de la opacidad espacial y un rebote de tamaño
  con rango amplio, respectivamente.
- Transporte sincronizado con Web Audio o reloj MIDI independiente; espacio
  reproduce/pausa y las flechas saltan ±3 segundos.
- Las figuras que comparten el último `note off` siempre crecen progresivamente
  desde su ataque hasta ese cierre, incluso si su forma tiene extensión o
  alargamiento desactivados. El reloj compensa la latencia física de salida del
  dispositivo para que no terminen antes de lo que se oye.
- Al terminar el contenido, el audio queda en silencio y el reloj visual
  continúa a `1×` durante media ventana temporal: el último `note off` cruza
  todo PAST y desaparece por el borde izquierdo sin ampliar la duración del
  audio ni las anclas.
- Interpolación por tramos de anclas `audioTime → midiTime`.
- Editor de sincronía a pantalla completa con zoom, desplazamiento, anclas
  verticales y magnetismo opcional a ataques. Cada ancla conserva su pulso MIDI:
  moverla sobre el audio recalcula la velocidad MIDI entre pulsos vecinos.
- MIDI y audio pueden arrastrarse juntos en una sola operación. Cuando ambos
  medios nuevos quedan listos, la sincronización automática se ejecuta y aplica
  una vez por pareja, sin reproducir el audio. Las anclas restauradas desde un
  JSON se conservan.
- El menú `Demos` descarga desde la propia aplicación el MIDI, el audio y el
  estado guardado de `El Intachable`, `Despasillo por favor` o
  `Melodía triste`, sin iniciar la reproducción.
- El alineador completamente local extrae chroma y ataques del audio, genera
  las mismas características desde el MIDI y calcula una ruta coarse-to-fine
  con DTW. La carga inicial aplica el resultado validado; las ejecuciones
  manuales posteriores conservan la propuesta reversible de anclas
  discontinuas. Su ancla terminal hace coincidir el final del audio con el
  último `note off` del MIDI.
- Los finales con ritardando reciben un segundo refinamiento automático: una
  envolvente RMS local confirma los ataques, reserva anclas de mayor densidad
  para la coda y conserva el DTW original cuando no demuestra una mejora real.
  Las coincidencias usadas para validar nunca son las mismas que crean las
  anclas. Si el último ataque está confirmado, la cola final puede sostener solo
  ese `release` hasta el cierre exacto, sin ralentizar ningún ataque anterior.
- Detección automática del primer contenido audible: el silencio inicial se
  omite en reproducción, forma de onda y reloj sin modificar el archivo local.
- Navegación, ancla seleccionada, tap tempo y offset reunidos en una franja
  inferior compacta para maximizar el área de la forma de onda.
- Offset inicial explícito: negativo hace esperar la animación; positivo la
  adelanta respecto al audio.
- El primer MIDI de una sesión usa el preset visual afinado en la obra
  `EL INTACHABLE`: ventana de 8 s, tamaño de nota `1.4×`, calidad Ultra,
  supersampling `3×`, animaciones globales y paleta/formas por familia. Al
  sustituirlo por otro MIDI se generan colores distintos por familia,
  conservando siempre la edición manual y los valores restaurados desde JSON.
- Superposición determinista por familia: percusión al fondo, seguida de
  auxiliares, maderas y cuerdas, con metales al frente. Dentro de las maderas,
  el orden de fondo a frente es flauta, clarinete, fagot y oboe.
- Pantalla completa disponible en la barra superior; conserva la relación
  Libre, `16:9` o `9:16` elegida en Canvas y oculta el puntero durante la
  presentación.
- Tarjeta final editable de cuatro líneas: entra secuencialmente en la esquina
  superior izquierda después de que la última figura abandona el canvas y su
  fotograma completo permanece congelado como cierre.
- UI táctil tipo iPad con columnas laterales colapsables; voz, figura y colores
  son los controles iniciales.
- Sincronía se trabaja en un espacio visual dedicado a pantalla completa.
- Selección directa de notas en el canvas para cambiar la figura o el color
  desde el inicio o a partir de ese punto MIDI.
- Etiquetas activables por voz, con recuadros que se ajustan automáticamente al
  texto, la fuente y su margen.
- Importación y exportación del estado JSON versionado.
- Catálogo de ocho figuras simples y familias de V1; las figuras dobles,
  contornos, conexiones, escenas y fondos fueron retirados por decisión de
  producto.

## Preparación

```bash
npm install
npm run dev
```

La aplicación queda disponible en `http://127.0.0.1:5173`. Para validar una
entrega:

```bash
npm test
npm run build
```

## Estructura

```text
.
├── src/
│   ├── core/                   MIDI, audio, alineación y estado persistible
│   ├── renderer/               Protocolo y puente del motor gráfico
│   ├── workers/                Parser y render fuera del hilo principal
│   └── ui/                     Interfaz React iPad-first
├── legacy/v1/                  Versión original congelada
├── docs/                       Línea base y plan de desarrollo
└── reference/
    └── midi-nowline-visualizer/ Prototipo local de referencia
```

El análisis técnico y las fases están en
[`docs/DEVELOPMENT_PLAN.md`](docs/DEVELOPMENT_PLAN.md). La procedencia de V1 se
documenta en [`docs/BASELINE.md`](docs/BASELINE.md).

## Compatibilidad

El camino de alto rendimiento requiere un navegador moderno con Web Workers,
Web Audio y `OffscreenCanvas`. V1 conserva sus pruebas originales con
`npm run test:legacy`.
