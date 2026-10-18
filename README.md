# Seriesflix — plugin de Kino

**Series** en latino, castellano o subtituladas, a través de [Seriesflix](https://seriesflixhd.pw), con el catálogo de TMDB.
Necesita Kino 0.9.55 o posterior. Solo series: el sitio no tiene películas.

Es la misma fuente que el plugin **Latino** trae entre las suyas (`src/sources/seriesflix.js` allá); este plugin va solo, con sus
propios extractores (nupload y Voe).

## Instalar

En Kino: **Plugins ▸ Agregar un plugin ▸ Kino**, y pega la dirección de este repositorio.

## Qué trae

- **Inicio** con trece filas de TMDB, todas de series: populares, en emisión, mejor valoradas, por género (acción y aventura,
  comedia, ciencia ficción y fantasía, drama, crimen, misterio, reality), infantil, documentales y anime. Cada título lleva sus
  géneros, así el Inicio de Kino lo archiva en la fila de cada género.
- **Categorías** con los géneros de series de TMDB, **búsqueda** y **episodios**.
- **Copias por idioma y servidor.** La página de cada episodio ofrece latino, castellano y subtitulado. La primera copia que abre
  se reproduce y las demás quedan en el menú **Servidor** (hasta ocho), sin abrirlas de antemano.
- **Idioma preferido** (ajuste): latino (por defecto), castellano o subtitulado; los otros dos van después. Dentro de cada idioma,
  primero Nupload y luego Voe.
- **Descargas** sin conexión en el teléfono.
- Textos en español e inglés.

## Notas

- **El sitio cambió de dirección:** `seriesflixhd.casa` y `seriesflixhd.best` ahora redirigen a `seriesflixhd.pw`. Este plugin
  declara los tres, porque Kino revisa cada salto de una redirección.
- **Voe** sirve el video desde un dominio que cambia; se abre pidiéndolo directamente (por eso el manifest pide `fetchHosts: "any"`)
  o, si no, con el navegador oculto de Kino (`browser`). Kino muestra ambos en rojo al instalar, igual que
  `streamHosts: "any"`, que cubre los CDN a los que redirigen los reproductores.
- Para encontrar la serie en el sitio se usan sus nombres en TMDB (es-MX, es-ES, original e inglés) y su año, que se guardan 7 días.
  Otra serie con el mismo nombre se descarta por el año.
- Que haya o no un episodio depende del sitio, no del plugin.

## Desarrollo

```
npm run build                       # empaqueta src/ en plugin.js (esbuild)
node --test test/plugin.test.mjs    # sin red: un Seriesflix simulado, con sus bloques por idioma y una página de nupload ofuscada igual
node sdk/validate.mjs .             # el manifest, como lo revisa Kino
```

`plugin.js` está generado desde `src/`: edita `src/` y vuelve a empaquetar. `sdk/` y `contract.json` son el kit de pruebas abierto
de Kino (Apache-2.0). Usa este plugin con contenido que tengas derecho a ver.
