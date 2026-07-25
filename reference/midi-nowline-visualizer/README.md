# MIDI NOW LINE Visualizer

Primer prototipo local de un visualizador MIDI/audio centrado en calidad de animacion.

## Ejecutar

```bash
npm start
```

Abrir:

```txt
http://127.0.0.1:5288/
```

## Validar sintaxis

```bash
npm run check
```

## Concepto central

- El canvas se divide verticalmente en 88 celdas, de A0 MIDI 21 a C8 MIDI 108.
- La NOW LINE esta en el centro horizontal exacto del canvas.
- El borde izquierdo de una figura cruza la NOW LINE en NOTE ON.
- El borde derecho cruza la NOW LINE en NOTE OFF.
- El cuerpo horizontal de la figura representa la duracion real de la nota.
- La animacion se mueve de derecha a izquierda siguiendo segundos reales.

Formula principal:

```js
xLeft = nowX + (note.start - now) * pxPerSecond;
xRight = nowX + (note.end - now) * pxPerSecond;
```

## Estado del prototipo

- Incluye timeline demo generada en codigo.
- Puede cargar archivos MIDI `.mid` / `.midi` con parser basico sin dependencias.
- Puede cargar audio local y usarlo como reloj de reproduccion.
- Renderiza capsulas, diamantes y pulsos por canal MIDI.
- Incluye opacidad por cercania al centro, glow y bump en NOTE ON.

## Futuro escritorio

La logica visual esta hecha sin framework para poder migrarla despues a una carcasa Electron o Tauri. La prioridad de esta fase es estabilizar el motor visual antes del empaquetado instalable.
