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
- Interpolación por tramos de anclas `audioTime → midiTime`.
- Editor de sincronía a pantalla completa con zoom, desplazamiento, anclas
  verticales y magnetismo opcional a ataques. Cada ancla conserva su pulso MIDI:
  moverla sobre el audio recalcula la velocidad MIDI entre pulsos vecinos.
- Detección automática del primer contenido audible: el silencio inicial se
  omite en reproducción, forma de onda y reloj sin modificar el archivo local.
- Navegación, ancla seleccionada, tap tempo y offset reunidos en una franja
  inferior compacta para maximizar el área de la forma de onda.
- Offset inicial explícito: negativo hace esperar la animación; positivo la
  adelanta respecto al audio.
- Colores distintos generados por familia al cargar un MIDI, conservando la
  edición manual y los colores restaurados desde JSON.
- Superposición determinista por familia: percusión al fondo, seguida de
  auxiliares, maderas y cuerdas, con metales al frente.
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
│   ├── core/                   MIDI, transporte y estado persistible
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
