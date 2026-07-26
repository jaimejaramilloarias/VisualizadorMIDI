# Contrato de paridad V1 → V2

V2 conserva las funciones musicales de V1 salvo las retiradas explícitamente por
producto: escenas alternativas, rejilla/marcador vertical e imagen de fondo.
Tampoco exporta video o audio; estas decisiones no afectan el JSON de estado.

| Área | Función existente en V1 | Estado V2 |
|---|---|---|
| Archivos | MIDI local | Migrada |
| Archivos | Audio WAV local | Migrada y ampliada a formatos Web Audio |
| Archivos | Importar/exportar configuración JSON | Migrada; contrato V2 versionado |
| Transporte | Play/stop, inicio, seek ±3 s | Migrada: play/pausa, inicio, ±3 s, scrub y atajos de teclado |
| Transporte | Audio offset en milisegundos | Migrada; convive con las anclas |
| Sincronía | Tap tempo, waveform y marcadores editables | Rediseñada en panel horizontal de ⅓ del canvas; los marcadores son anclas JSON |
| Sincronía | Mapa de tempo MIDI | Migrada |
| Visual | Ventana de segundos visibles | Migrada |
| Visual | 16:9, 9:16, fullscreen | Migrada |
| Visual | FPS y supersampling | Rediseñada; Auto sigue la pantalla, con límites de 60/30 y resolución adaptativa |
| Visual | Color de canvas | Migrada |
| Visual | Imagen de fondo y opacidad | Retirada por decisión de producto; solo color sólido |
| Visual | Etiquetas de nota, fuente, color y tamaño | Rediseñada; activación por voz y recuadro dinámico independiente |
| Instrumentos | Activar/desactivar uno, todos o ninguno | Migrada |
| Instrumentos | Asignar instrumento a familia | Migrada |
| Instrumentos | Color y figura por instrumento | Migrada |
| Familias | Familias orquestales y cinco familias custom | Migrada |
| Familias | Color principal/secundario y tono | Migrada |
| Figuras | Catálogo de figuras | Rediseñada; ocho figuras simples, sin variantes dobles |
| Figuras | Extensión dinámica y alargamiento | Migrada por figura, familia e instrumento |
| Geometría | Posición de NOW y dirección de extensión | Rediseñada; NOW centrado y extensión exclusivamente hacia PAST |
| Geometría | Altura global/familia e influencia de velocidad | Migrada |
| Efectos | Opacidad extremos/centro | Migrada |
| Efectos | Glow y bump global/familia | Rediseñada; pulsos breves en Note On, halo independiente y rango ampliado |
| Efectos | Contorno full/pre/post | Retirada por decisión de producto |
| Efectos | Líneas de conexión por familia | Retirada por decisión de producto |
| Efectos | Atracción hacia NOW, intensidad y zona de aceleración | Rediseñada; trayectoria única, entrada lenta y aceleración magnética continua |
| UX | Modal multiselección y asignación por arrastre/Shift | Migrada a selección iPad, Shift/Cmd y drag & drop |
| UX | Edición directa de figuras | Rediseñada; clic sobre nota y cambio desde el inicio o desde ese punto |
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
- `npm run test`: 42 pruebas V2 correctas.
- `npm run test:legacy`: 51 archivos de regresión V1 correctos.
- Navegador: consola limpia y diseño sin overflow en 1024×768 y 768×1024.
