# Visualizador MIDI 2

Espacio de trabajo para la reestructuración profunda de Visualizador MIDI.

La raíz contiene una línea base funcional importada desde
[`jaimejaramilloarias/VisualizadorMIDI`](https://github.com/jaimejaramilloarias/VisualizadorMIDI)
en el commit `824a0f52df4734b5cac817aac13e4d2d0dcf2f10` (3 de abril de 2026).
La versión original no fue modificada.

## Estado actual

- Código, recursos visuales y 54 archivos de prueba importados.
- Suite oficial de 51 pruebas disponible con `npm test`.
- Repositorio original configurado como remoto Git `upstream`.
- Prototipo local `midi-nowline-visualizer` conservado dentro de `reference/`.
- Arquitectura existente y estrategia inicial documentadas en
  [`docs/BASELINE.md`](docs/BASELINE.md).

Todavía no se ha reescrito la aplicación: este punto sirve como línea base
verificable antes de cambiar su arquitectura.

## Preparación

```bash
npm install
npm test
```

`npm run test:all` incluye además tres pruebas que no formaban parte de la suite
oficial del repositorio original. Actualmente sirve como auditoría de deuda
técnica y puede fallar.

La aplicación es estática. Para abrirla desde un servidor local:

```bash
python3 -m http.server 8080
```

Después visita `http://localhost:8080`.

## Estructura

```text
.
├── index.html                  Interfaz actual
├── script.js                   Orquestación y lógica principal heredada
├── utils.js                    Renderizado, formas y utilidades heredadas
├── midiLoader.js               Carga de archivos MIDI
├── wavLoader.js                Carga de audio WAV
├── audioPlayer.js              Reproducción de audio
├── ui.js                       Inicialización de UI
├── configuracion.js            Controles de configuración
├── renderLoop.js               Cola y bucle de renderizado
├── new_shapes/                 Recursos visuales
├── test_*.js                  Pruebas de regresión de la versión original
├── docs/                       Inventario y decisiones de arquitectura
└── reference/
    └── midi-nowline-visualizer/ Prototipo local, solo como referencia
```

## Regla de migración

La reestructuración debe ser incremental: mantener las pruebas verdes, extraer
una responsabilidad a la vez y evitar una reescritura total sin puntos de
comparación.
