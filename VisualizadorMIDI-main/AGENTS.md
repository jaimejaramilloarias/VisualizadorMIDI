PLAN DE DESARROLLO DE APP WEB

App web: Visualizador MIDI - Jaime Jaramillo Arias

Descripción: la app permite cargar archivos MIDI de música para generar una animación y visualizar el contenido del archivo MIDI. Permite también cargar archivos WAV para reproducir al tiempo con la animación.

El objetivo fundamental de la app, es producir animaciones detalladas, fluidas y complejas, de la más alta calidad.

Elementos de la UI:

1.	Titulo.
2.	Menú superior con los siguientes botones, de izquierda a derecha: “Cargar MIDI”, “Cargar WAV”, “Play/Stop” (atado a la barra espaciadora), “Adelantar” (adelanta 3 segundos), “Atrasar” (atrasa 3 segundos), “Inicio”, “16:9”, “9:16”, “Pantalla completa” (este botón amplía el canvas en la resolución elegida a la pantalla completa, y la app debe hacer super sampleo de los pixeles para no perder claridad).
3.	Canvas. El Canvas principal debe tener 720px de altura, ya sea en 16:9 o en 9:16. Ya cuando se pase a pantalla completa, la resolución debe aumentar.
4.	Menú inferior con los siguientes botones, de izquierda a derecha: “Instrumento” (drop down para seleccionar los instrumentos del archivo MIDI cargado), “Familia” (drop down para seleccionar la familia a la que pertenece el instrumento seleccionado en el drop down anterior), la lista de familias siempre debe estar completa así no esté cargado ningún instrumento, las familias son: Maderas de timbre “redondo”, Dobles cañas, Saxofones, Metales, Percusión menor, Tambores, Platillos, Placas, Auxiliares, Cuerdas frotadas, Cuerdas pulsadas, Voces. 
5.	Panel inferior desplegable mediante un botón tipo “flecha” que muestra una lista de todas las familias, con la posibilidad de elegir el color y la figura geométrica para las animaciones de los instrumentos a los que se les adjudique esa familia.

Lógica de importación de archivos:

1.	El botón de “Cargar MIDI” abre una ventana para cargar localmente un archivo MIDI de música.
2.	La app debe extraer la siguiente información: note ON, note OFF, note duration, note velocity, tempo map, track names.
3.	La app debe adjudicar a cada instrumento una familia según su track name.
4.	El botón de “Cargar WAV” abre una ventana para cargar localmente un archivo WAV.
5.	La app debe ignorar cualquier silencio al comienzo del audio y posicionar el playhead interno justo cuando comience la señal de audio.
6.	Al momento de dar play, comienzan a reproducirse tanto el audio como la animación.

Lógica de la animación:

1.	La animación dentro del canvas representará el paso de las notas del archivo MIDI a través del tiempo, que se irán moviendo desde su aparición por el extremo derecho, hasta desaparecer en el extremo izquierdo. 
2.	Las figuras geométricas deben estar alineadas en su extremo izquierdo con los datos de NOTE ON, y en su extremo derecho con los datos de NOTE OFF de manera que su longitud en el canvas represente su duración musical.
3.	La mitad exacta del canvas será considerada la “LINEA DE PRESENTE” y representa el estado del playhead del midi/audio.
4.	Las figuras geométricas deben tener baja opacidad en los extremos horizontales del canvas, y solo deben llenarse por completo mientras pasan por la línea del presente.
5.	La opacidad de las notas no es progresiva cuando pasan por el presente, es decir, si en los extremos la opacidad es del 5%, solo debe aumentar progresivamente hasta un 70% hacia el centro del canvas y pasar abruptamente al 100% cuando la nota esté pasando por el presente, para luego volver a pasar abruptamente al 70% y continuar de nuevo progresivamente hasta el 5%.
6.	La altura de las figuras debe ser aprox de un 110% de la altura del grid invisible que representa las 88 divisiones verticales del canvas.
7.	Al momento de que el NOTE ON llegue a la línea de presente, las figuras deben tener un efecto de “bump” que consistirá en cambiar su altura hasta un 150% de manera abrupta para regresar progresivamente al 100% al momento en el que el NOTE OFF pase por la línea de presente.
8.	También en el momento del NOTE ON “presente”, debe haber un efecto leve de “brillo” blanco en el contorno de la figura, que desaparezca progresiva y rápidamente (no espera hasta el note off “presente”).
9.	Al pasar de 16:9 a 9:16 la estructura del canvas NO CAMBIA, se redimensiona, pero sigue mostrando 88 notas verticales, 6 segundos horizontales, y la línea de presente exactamente en el centro.

Figuras geométricas a emplear:

1.	Ovalos alargados (del note on al off).
2.	Cápsulas alargadas (rectángulos con bordes redondeados).
3.	Estrellas alargadas (de 4 puntas y con lados cóncavos).
4.	Diamantes alargados con lados rectos (alineados entre el note on y el note off).
5.	Círculos SIN alargamiento (para dibujarla solo se toman en cuenta la altura del grid y el note ON, no el note off).
6.	Cuadrados SIN alargamiento.
7.	Triángulos invertidos SIN alargamiento.
8.	Estrellas de 4 puntas SIN alargamiento.
9.	Pentágonos SIN alargamiento.

Figuras y colores de las familias:

1.	Cada familia tiene predeterminada una forma y un color.
2.	Maderas de timbre “redondo”: ovalos alargados azules.
3.	Dobles cañas: estrellas alargadas violeta.
4.	Saxofones: estrellas alargadas café claro.
5.	Metales: capsulas alargadas amarillas.
6.	Percusión menor: pentágonos sin alargamiento grises.
7.	Tambores: círculos sin alargamiento, grises.
8.	Platillos: círculos sin alargamiento, grises con tamaño + 30%.
9.	Placas: cuadrados sin alargamiento rojos.
10.	Auxiliares: círculos sin alargamiento morado oscuro con bump + 30%.
11.	Cuerdas frotadas: diamantes alargados naranjas.
12.	Cuerdas pulsadas: estrellas de 4 puntas sin alargamiento verdes.
13.	Voces: cápsulas alargadas grises.

Colores de los instrumentos: 

Ya que en una familia hay varios instrumentos, la app debe usar un tono de color más claro o más oscuro según el tipo de instrumento y su posición en el resgitro, por ejemplo: ya que el piccolo es más agudo que la flauta, debe tener un azul más claro, lo mismo el clarinete que debe ser más oscuro que la flauta por estar en un registro más grave. Pero atención: este cambio del tono de los colores NO se hace por nota, sino por instrumento, así las trompetas son un poco más claras que los trombones, y la tuba es un poco más oscura que los trombones.

Arquitectura de la app:

La app debe funcionar como aplicación web, y estar modularizada lo suficiente para que su desarrollo sea incremental, el código debe estar bien comentado de manera que los agentes puedan encontrar fácilmente sus bloques y funcionalidades.

Diseña un plan INCREMENTAL para desarrollar la app, y crea una lista de tareas a realizar en un archivo “agents_tareas”, para que el agente vaya completando las tareas en un orden lógico y sin afectar las funcionalidades previas.


