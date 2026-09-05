# Dependencias JS de terceros -- autohospedadas

CORRIGE hallazgo GRAVE G15-09 de la Auditoria Integral N.15: "uso de
CDN externos en frontend". Antes, 33 paginas cargaban Chart.js y
SheetJS (xlsx) directamente desde `cdnjs.cloudflare.com`, ampliando
la cadena de suministro del navegador con un tercero que participa en
el contexto de una aplicacion de salud ocupacional (podia servir
codigo distinto al esperado, sufrir una brecha, o simplemente dejar
de estar disponible).

Ambos archivos de este directorio son exactamente las mismas
versiones que ya se usaban (verificado contra el `package.json` de
cada paquete tras instalarlo con npm), asi que este cambio NO
modifica ningun comportamiento -- solo elimina la dependencia de un
origen externo en tiempo de ejecucion.

| Archivo                  | Paquete npm | Version | Origen                                              |
|---------------------------|-------------|---------|------------------------------------------------------|
| `chart.umd.min.js`        | `chart.js`  | 4.4.1   | `node_modules/chart.js/dist/chart.umd.js`, minificado con `terser` (el paquete npm no publica una build UMD ya minificada). |
| `xlsx.full.min.js`        | `xlsx`      | 0.18.5  | `node_modules/xlsx/dist/xlsx.full.min.js` (SheetJS SI publica esta build ya minificada). |

## Como actualizar una version

```bash
npm install chart.js@<version> xlsx@<version> --no-save --prefix /tmp/vendor-build
npx --prefix /tmp/vendor-build terser /tmp/vendor-build/node_modules/chart.js/dist/chart.umd.js -c -m -o lib/chart.umd.min.js
cp /tmp/vendor-build/node_modules/xlsx/dist/xlsx.full.min.js lib/xlsx.full.min.js
```

Actualizar tambien la tabla de arriba y el numero de version en el
comentario de cabecera de ambos archivos si se cambia de version.

## Nota sobre CSP

La directiva `script-src` de cada pagina que antes incluia
`https://cdnjs.cloudflare.com` fue actualizada para retirarla: los
scripts ahora son same-origin (`'self'`), asi que ya no hace falta
declarar un origen externo confiable para ellos.
