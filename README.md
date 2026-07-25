# MIDI Stage — Visualizador MIDI V2

Aplicación web local-first para visualizar archivos MIDI con animación de alta
resolución, audio opcional y sincronización mediante anclas. No exporta video ni
audio: prioriza una reproducción fluida y de calidad directamente en la web.

Los archivos MIDI y de audio se procesan en memoria en el dispositivo. El estado
de la visualización se puede guardar como JSON, pero ese archivo solo contiene
ajustes, nombres de referencia y anclas de tiempo; nunca contiene los medios.

## MVP actual

- Visualizaciones `NOW LINE` y `Piano Roll`.
- Parser MIDI formato 0/1 con mapa de tempo, running status y sustain.
- Parsing y renderizado en Workers.
- `OffscreenCanvas` con resolución adaptativa `Auto`, `Alta` y `Ultra`.
- Transporte sincronizado con Web Audio o reloj MIDI independiente.
- Interpolación por tramos de anclas `audioTime → midiTime`.
- UI táctil tipo iPad con columnas laterales colapsables.
- Importación y exportación del estado JSON versionado.

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
