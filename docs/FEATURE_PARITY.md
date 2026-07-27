# Contrato de paridad V1 → V2

V2 conserva las funciones musicales de V1 salvo las retiradas explícitamente por
producto: Piano Roll, Órbita, figuras dobles, contornos, líneas de conexión,
rejilla/marcador vertical e imagen de fondo. Tampoco exporta video o audio; estas
decisiones no afectan el JSON de estado.

| Área | Función existente en V1 | Estado V2 |
|---|---|---|
| Archivos | MIDI local | Migrada; admite carga conjunta por arrastre con el audio |
| Archivos | Audio WAV local | Migrada y ampliada a formatos Web Audio; admite carga conjunta y conserva la detección y omisión del silencio inicial |
| Archivos | Importar/exportar configuración JSON | Migrada; contrato V2 versionado |
| Transporte | Play/stop, inicio, seek ±3 s | Migrada: play/pausa, inicio, ±3 s, scrub y atajos de teclado |
| Transporte | Audio offset en milisegundos | Migrada; offset negativo hace esperar la animación y positivo la adelanta |
| Sincronía | Tap tempo, waveform y marcadores editables | Editor visual a pantalla completa con anclas verticales, zoom, desplazamiento, magnetismo y controles compactos |
| Sincronía | Alineación automática audio–MIDI | Ampliación V2: chroma + ataques + DTW, refinamiento RMS de ritardandos y cierre exacto audio → último note off; se aplica una vez al cargar una pareja nueva y conserva preview reversible al recalcular manualmente |
| Sincronía | Mapa de tempo MIDI | Migrada; mover una ancla conserva su pulso y cambia la velocidad MIDI del tramo |
| Visual | Ventana de segundos visibles | Migrada |
| Visual | 16:9, 9:16, fullscreen | Migrada |
| Visual | FPS y supersampling | Rediseñada; Auto sigue la pantalla, con límites de 60/30 y resolución adaptativa |
| Visual | Color de canvas | Migrada |
| Visual | Imagen de fondo y opacidad | Retirada por decisión de producto; solo color sólido |
| Visual | Etiquetas de nota, fuente, color y tamaño | Rediseñada; activación por voz y recuadro dinámico independiente |
| Instrumentos | Activar/desactivar uno, todos o ninguno | Migrada |
| Instrumentos | Asignar instrumento a familia | Migrada |
| Instrumentos | Color y figura por instrumento | Migrada; ambos controles están en cada fila de Voces |
| Instrumentos | Altura, glow, bump, extensión, alargamiento y viaje por instrumento | Migrada al menú único Animaciones |
| Familias | Familias orquestales y cinco familias custom | Migrada |
| Familias | Color y figura | Migrada; el color secundario heredado se conserva al importar JSON V1, pero no se muestra porque pertenecía a figuras dobles |
| Familias | Restablecer personalización | Migrada por familia |
| Figuras | Catálogo de figuras | Rediseñada; ocho figuras simples, sin variantes dobles |
| Figuras | Extensión dinámica y alargamiento | Migrada por figura, familia e instrumento |
| Geometría | Posición de NOW y dirección de extensión | Rediseñada; NOW centrado y extensión exclusivamente hacia PAST |
| Geometría | Salida visual después del último note off | Ampliación V2; las figuras terminales crecen hasta el cierre audible compensando la latencia física y luego continúan en post-roll silencioso a 1× hasta abandonar el borde izquierdo |
| Geometría | Altura global/familia e influencia de velocidad | Migrada |
| Geometría | Orden de superposición entre familias | Rediseñada; percusión al fondo y metales al frente |
| Efectos | Opacidad extremos/centro | Migrada |
| Efectos | Glow y bump global/familia/instrumento | Rediseñada; pulsos breves en Note On, halo independiente y rango ampliado |
| Efectos | Contorno full/pre/post | Retirada por decisión de producto |
| Efectos | Líneas de conexión por familia | Retirada por decisión de producto |
| Efectos | Atracción hacia NOW, intensidad y zona de aceleración | Rediseñada; controles globales, por familia y por instrumento, con llegada exacta al Note On |
| UX | Modal multiselección y asignación por arrastre/Shift | Migrada a selección iPad, Shift/Cmd y drag & drop |
| UX | Edición directa de figuras | Rediseñada; clic sobre nota y cambio desde el inicio o desde ese punto |
| UX | Ayuda contextual | Migrada a guía integrada y tooltips |
| UX | Modo desarrollador | Sustituido por Rendimiento: Hz de pantalla, FPS real/objetivo, P95, resolución y escala Retina |
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
- `npm run test`: 116 pruebas V2 correctas.
- `npm run test:legacy`: 51 archivos de regresión V1 correctos.
- El único test V1 sin implementación real continúa siendo `MIDI Learn`, que ya
  era un stub en el prototipo y no representa una función perdida.
