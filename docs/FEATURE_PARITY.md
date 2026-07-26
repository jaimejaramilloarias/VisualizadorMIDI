# Contrato de paridad V1 → V2

V2 conserva las funciones musicales de V1 salvo las retiradas explícitamente por
producto: escenas alternativas, rejilla/marcador vertical e imagen de fondo.
Tampoco exporta video o audio; estas decisiones no afectan el JSON de estado.

| Área | Función existente en V1 | Estado V2 |
|---|---|---|
| Archivos | MIDI local | Migrada |
| Archivos | Audio WAV local | Migrada y ampliada a formatos Web Audio |
| Archivos | Importar/exportar configuración JSON | Migrada; contrato V2 versionado |
| Transporte | Play/stop, inicio, seek ±3 s | Migrada: play/pausa, inicio, ±3 s y scrub |
| Transporte | Audio offset en milisegundos | Migrada; convive con las anclas |
| Sincronía | Tap tempo, waveform y marcadores editables | Migrada; los marcadores son anclas JSON |
| Sincronía | Mapa de tempo MIDI | Migrada |
| Visual | Ventana de segundos visibles | Migrada |
| Visual | 16:9, 9:16, fullscreen | Migrada |
| Visual | FPS y supersampling | Rediseñada; sigue el refresco de pantalla y adapta resolución/DPR |
| Visual | Color de canvas | Migrada |
| Visual | Imagen de fondo y opacidad | Retirada por decisión de producto; solo color sólido |
| Visual | Etiquetas de nota, fuente, color y tamaño | Migrada |
| Instrumentos | Activar/desactivar uno, todos o ninguno | Migrada |
| Instrumentos | Asignar instrumento a familia | Migrada |
| Instrumentos | Color y figura por instrumento | Migrada |
| Familias | Familias orquestales y cinco familias custom | Migrada |
| Familias | Color principal/secundario y tono | Migrada |
| Figuras | Catálogo completo de 16 figuras | Migrada |
| Figuras | Extensión dinámica y alargamiento | Migrada por figura, familia e instrumento |
| Geometría | Altura global/familia e influencia de velocidad | Migrada |
| Efectos | Opacidad extremos/centro | Migrada |
| Efectos | Glow y bump global/familia | Migrada |
| Efectos | Contorno full/pre/post | Migrada |
| Efectos | Líneas de conexión por familia | Migrada |
| Efectos | Viaje desde NOTE ON, intensidad y zona magnética | Migrada |
| UX | Modal multiselección y asignación por arrastre/Shift | Migrada a selección iPad, Shift/Cmd y drag & drop |
| UX | Ayuda contextual | Migrada a guía integrada y tooltips |
| Motor | Render offscreen y ajuste por DPR | Migrada y mejorada con Worker |
| Motor | Refrescar animación sin perder estado | Migrada |

## Regla de entrega

Cada fila que pase a “Migrada” debe:

1. existir en el JSON cuando represente estado persistible;
2. poder operarse desde la UI iPad-first;
3. modificar el Worker de render o el transporte sin depender del DOM;
4. tener prueba V2 o una regresión manual reproducible;
5. conservar la lectura de configuraciones V1 compatibles y descartar con
   seguridad los campos de funciones retiradas.

## Evidencia de esta etapa

- `npm run build`: compilación TypeScript y bundle de producción correctos.
- `npm run test`: 21 pruebas V2 correctas.
- `npm run test:legacy`: 51 archivos de regresión V1 correctos.
- Navegador: consola limpia y diseño sin overflow en 1024×768 y 768×1024.
