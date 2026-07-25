# Línea base y mapa de reestructuración

## Procedencia

### Aplicación principal

- Repositorio: `jaimejaramilloarias/VisualizadorMIDI`
- Rama consultada: `main`
- Commit importado: `824a0f52df4734b5cac817aac13e4d2d0dcf2f10`
- Fecha del commit: 3 de abril de 2026
- Remoto local: `upstream`

La importación incluye el código fuente, los recursos de `new_shapes/`, la
configuración predeterminada y todas las pruebas. No incluye el historial Git
del proyecto original, dependencias instaladas ni archivos generados.

### Prototipo local

`reference/midi-nowline-visualizer/` es una copia del prototipo encontrado en
Documentos. Tiene un servidor HTTP mínimo y una implementación Canvas separada.
Se conserva para comparar decisiones de animación y de la línea temporal, pero
no forma parte de la aplicación principal ni de sus dependencias.

## Diagnóstico de la arquitectura actual

La aplicación principal funciona directamente en el navegador, sin bundler.
`index.html` carga ocho scripts globales en un orden fijo:

1. `utils.js`
2. `midiLoader.js`
3. `wavLoader.js`
4. `audioPlayer.js`
5. `ui.js`
6. `help.js`
7. `configuracion.js`
8. `script.js`

Los puntos de presión más importantes son:

- `script.js`: 6.557 líneas; mezcla estado, persistencia, MIDI, sincronización,
  UI y renderizado.
- `utils.js`: 2.156 líneas; mezcla geometría, estilos, configuración y bucles de
  animación.
- Estado global compartido y dependencia del orden de las etiquetas `<script>`.
- API híbrida: globales para el navegador y `module.exports` para las pruebas.
- `package.json` usa una única dependencia (`jsdom`). La suite oficial ejecuta
  51 archivos en procesos aislados mediante `test-runner.js`.
- El repositorio contiene otros tres archivos de prueba que no estaban incluidos
  en su comando original: `test_menu_accessibility.js`, `test_multi_drag.js` y
  `test_velocity_base_persistence.js`. Los dos últimos pasan por separado; la
  prueba de accesibilidad del menú queda registrada como deuda de la línea base.
- No existe una frontera explícita entre dominio MIDI, transporte, renderizado,
  configuración y adaptadores del navegador.

## Flujo funcional actual

```text
Archivo MIDI ──> midiLoader / parseMIDI ──> pistas y notas
                                               │
Archivo WAV ──> wavLoader / audioPlayer ──> reloj de reproducción
                                               │
Configuración + localStorage ──────────────────┤
                                               ▼
                                  cálculo de notas visibles
                                               │
                                               ▼
                                  Canvas + formas + efectos
```

## Fronteras propuestas para V2

La migración debería converger hacia estas capas:

```text
src/
├── domain/
│   ├── midi/          Parser, tempo, pistas, notas e instrumentos
│   └── timeline/      Tiempo musical y ventanas visibles
├── application/
│   ├── playback/      Transporte, seek, pausa y sincronización
│   └── configuration/ Casos de uso y validación de ajustes
├── infrastructure/
│   ├── audio/         Web Audio
│   ├── midi/          Lectura de archivos
│   └── persistence/   localStorage e importación/exportación
├── presentation/
│   ├── canvas/        Geometría, formas, efectos y render loop
│   └── ui/            DOM, eventos, paneles y accesibilidad
└── app/               Composición e inicio de la aplicación
```

## Secuencia recomendada

1. Congelar esta línea base y registrar el resultado de las 51 pruebas oficiales.
2. Separar las funciones puras de MIDI y tiempo, manteniendo compatibilidad con
   las exportaciones actuales.
3. Crear un único modelo de estado y eliminar escrituras directas dispersas a
   `localStorage`.
4. Extraer el transporte y el reloj de reproducción.
5. Separar el motor Canvas de los controles DOM.
6. Migrar a módulos ES y, cuando la estructura se estabilice, a un framework de
   pruebas con mejores reportes. El runner actual ya descubre `test_*.js`.
7. Dividir la interfaz en componentes pequeños, sin alterar primero el aspecto.
8. Incorporar del prototipo NOW LINE únicamente las ideas que superen pruebas
   visuales y de rendimiento.

## Criterios de seguridad para la migración

- Las pruebas existentes deben seguir ejecutándose durante cada extracción.
- Parser, reloj y geometría deben poder probarse sin DOM.
- El renderizado no debe leer directamente de `localStorage`.
- La UI no debe ser la propietaria del estado de reproducción.
- Cualquier cambio visual debe compararse con la línea base antes de integrarse.
