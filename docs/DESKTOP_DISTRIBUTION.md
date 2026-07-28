# Distribución de escritorio

MIDI Stage V2 conserva el mismo motor visual, las tres demos, la carga conjunta
de MIDI/audio y los estados JSON de la edición web. Todo el procesamiento
continúa en el dispositivo; la aplicación de escritorio no necesita conexión a
Internet ni incorpora exportación audiovisual.

## Ediciones

### macOS Universal

- Electron 43.2.0.
- macOS 12 Monterey o posterior.
- Un solo binario con Intel `x86_64` y Apple Silicon `arm64`.
- DMG para instalación y ZIP para distribución directa.

### macOS Catalina Legacy

- Electron 32.3.3.
- macOS 10.15.x; se recomienda 10.15.7.
- Solo Mac Intel `x86_64`.
- DMG y ZIP separados de la edición Universal.

Electron 33 eliminó la compatibilidad con Catalina y Electron 32 ya alcanzó su
fin de soporte. La edición Legacy no recibe las actualizaciones actuales de
Chromium o Electron y debe utilizarse únicamente cuando no sea posible
actualizar macOS. Para reducir su superficie de riesgo, MIDI Stage bloquea
navegación, ventanas y permisos externos y trabaja con archivos locales.

### Windows

- Electron 43.2.0.
- Windows 10 o Windows 11 de 64 bits.
- Arquitectura `x64`.
- Instalador asistido NSIS con elección de carpeta y accesos directos.

Windows 7, 8 y 8.1, Windows ARM64, Windows de 32 bits y Linux no forman parte de
esta entrega.

## Instalación

### macOS

1. Descarga el DMG correspondiente a tu versión de macOS.
2. Abre el DMG y arrastra `MIDI Stage V2` a `Aplicaciones`.
3. Abre la aplicación desde Finder o Launchpad.

No uses la edición Universal en Catalina: descarga expresamente el archivo
`macOS-Catalina-x64`.

### Windows

1. Descarga el archivo `Windows-x64-Setup.exe`.
2. Ejecuta el instalador.
3. Elige la carpeta y los accesos directos deseados.
4. Abre MIDI Stage V2 desde el menú Inicio.

## Firma y advertencias del sistema

El repositorio no contiene certificados privados. Una entrega solo se considera
firmada cuando la release lo indica expresamente y las comprobaciones de firma
terminan correctamente.

Si no están configuradas las credenciales, los artefactos se publican como
`Preview sin firmar`:

- macOS puede mostrar una advertencia de desarrollador no identificado.
- Windows SmartScreen puede mostrar `Editor desconocido`.

No se debe desactivar globalmente Gatekeeper, SmartScreen ni la cuarentena del
sistema. Para una entrega estable sin advertencias se requiere:

- certificado Apple Developer ID, firma, notarización y ticket grapado para
  macOS;
- certificado Authenticode para Windows;
- credenciales almacenadas únicamente como secretos del sistema de integración;
- sumas SHA-256 publicadas junto a los instaladores.

## Compilación local

Requisito de desarrollo: Node.js 22.12 o posterior. Los usuarios finales no
necesitan Node.js.

```bash
npm ci
npm ci --prefix legacy/v1
npm run test:all
npm run desktop:smoke
```

Instaladores:

```bash
npm run desktop:mac:universal
npm run desktop:mac:catalina
npm run desktop:win
```

Los resultados quedan en `release/desktop/`. El instalador de Windows se genera
y valida en un runner Windows; una compilación cruzada desde macOS no sustituye
esa validación.

## Validación de una entrega

Las comprobaciones automáticas incluyen:

- pruebas V2, seguridad de escritorio y regresión V1;
- TypeScript y bundle de producción sin mapas de fuente;
- smoke test del protocolo interno, recursos y demos sin exponer Node al
  renderer;
- fuses de Electron restrictivos y ASAR íntegro;
- binario Universal con `x86_64` y `arm64`;
- versión mínima 12.0.0 para Universal y 10.15.0 para Catalina;
- aplicación Catalina exclusivamente `x86_64`;
- integridad del DMG, ZIP e instalador NSIS;
- sumas SHA-256.

Antes de declarar una versión estable también se debe probar manualmente en un
Mac Apple Silicon moderno, un Mac Intel moderno, un Mac Intel con Catalina
10.15.7, Windows 10 x64 y Windows 11 x64. En cada sistema se verifica arranque,
carga conjunta MIDI/audio, reproducción, sincronía, editor de anclas,
importación/exportación JSON, demos, Workers, pantalla completa y cierre limpio.

La aplicación no incorpora actualización automática. Los archivos MIDI/audio
no se guardan dentro de ella y los estados JSON existentes siguen siendo
archivos independientes.
