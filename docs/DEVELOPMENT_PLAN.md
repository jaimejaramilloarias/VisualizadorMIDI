# Plan de desarrollo — Visualizador MIDI V2

## Producto

Aplicación web local-first para reproducir visualizaciones MIDI de alta calidad,
con audio opcional y sincronización mediante anclas. No incluye exportación de
video ni audio. Los archivos musicales se leen en memoria y no se suben al
servidor.

El único artefacto persistente e intercambiable es un JSON pequeño que contiene:

- visualización seleccionada;
- parámetros visuales;
- nombres de referencia del MIDI y del audio;
- pares `audioTime → midiTime` usados para sincronización.

El JSON no contiene bytes, URLs de objetos, audio, MIDI ni fotogramas.

## Prioridades de ingeniería

1. Fluidez perceptual y sincronía estable.
2. Alta resolución con coste de GPU/memoria acotado.
3. Interfaz táctil tipo iPad, fácil de explorar.
4. Recuperación clara ante archivos inválidos o navegadores incompatibles.
5. Arquitectura pequeña y comprobable; cada capa tiene una responsabilidad.

## Arquitectura objetivo

```text
MIDI local ──> Worker de parsing ──> notas compactas en TypedArrays ─┐
                                                                    │
Audio local ──> Web Audio ──> reloj de transporte ─> mapa de anclas ├─> Worker de render
                                                                    │       │
JSON ──> validación ──> escena, ajustes y anclas ────────────────────┘       ▼
                                                                   OffscreenCanvas
```

- `src/core/midi`: parser SMF, tempo, pistas, sustain y clasificación.
- `src/core/transport`: reloj único para reproducción con o sin audio.
- `src/core/state`: contrato JSON versionado e interpolación de anclas.
- `src/renderer`: puente sin estado visual entre React y el Worker.
- `src/workers`: parsing y render fuera del hilo de interfaz.
- `src/ui`: composición, accesibilidad, paneles y flujo de archivos.
- `legacy/v1`: aplicación original congelada para comparación y regresiones.

## Decisiones de rendimiento

- El parser corre en un Worker y entrega arreglos tipados transferibles.
- El lienzo usa `OffscreenCanvas` en otro Worker.
- React no recibe una actualización por fotograma; la UI se refresca a una
  frecuencia menor mientras el reloj visual conserva la precisión.
- El render limita la densidad física a un presupuesto de píxeles según
  `Auto`, `Alta` o `Ultra`.
- La búsqueda visible usa notas ordenadas, búsqueda binaria y un índice separado
  para notas de más de 30 segundos.
- La sincronización interpola por tramos entre anclas y extrapola en los extremos.

## Interacción iPad-first

- Controles principales de al menos 44 px.
- Iconos coherentes con etiqueta visible en anchos amplios y `aria-label`/tooltip.
- Columnas laterales colapsables; en pantallas estrechas funcionan como paneles.
- Transporte persistente bajo el lienzo.
- Ajustes agrupados en un inspector y visualizaciones en una biblioteca de escenas.
- Respeto de `prefers-reduced-motion`, áreas seguras y navegación por teclado.

## Etapas

### 1. Fundación — completada

- Preservar V1 en `legacy/v1`.
- React + TypeScript + Vite.
- Contrato de estado JSON.
- Parser MIDI y pruebas unitarias.

### 2. Núcleo audiovisual — completada

- Transporte con Web Audio y reloj MIDI sin audio.
- Parsing en Worker.
- Render en Worker con NOW LINE y Piano Roll.
- Presupuestos de resolución y telemetría.

### 3. Experiencia de producto — completada para MVP

- Carga y arrastre de MIDI/audio.
- Paneles colapsables e interfaz táctil.
- Editor de anclas.
- Importación/exportación JSON sin medios.

### 4. Endurecimiento — siguiente

- Pruebas con corpus amplio de MIDI formato 0/1.
- Métricas en iPad Safari, Chrome y equipos con GPU integrada.
- Fallback de render en hilo principal para navegadores sin OffscreenCanvas.
- Presets visuales adicionales con el mismo contrato.
- Accesibilidad auditada con lector de pantalla.

## Criterios de aceptación del MVP

- MIDI y audio nunca abandonan el navegador.
- Reproducir, pausar, buscar y reiniciar usan un único reloj.
- Dos o más anclas corrigen tanto desfase como deriva.
- El JSON restaurado reproduce la escena y la sincronización al volver a cargar
  manualmente los archivos indicados.
- La aplicación compila sin errores, las pruebas del núcleo pasan y la animación
  se mantiene separada del hilo de React.
