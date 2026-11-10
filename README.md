# Profe

Sitio estático para practicar para el concurso de méritos docente en Colombia (Concurso docente CNSC). Banco de preguntas por temas, simulacros, repaso de errores y pregunta del día. El progreso se guarda solo en tu navegador (`localStorage`).

> No es un sitio oficial. El contenido es de práctica; verifica siempre las normas en las fuentes oficiales (CNSC, MEN).

## Ejecutar en local

No hay paso de compilación. Desde la carpeta del proyecto:

```
python -m http.server 8765
```

Abre http://localhost:8765. (No abras `index.html` con doble clic: el navegador bloquea `fetch` en `file://`.)

## Publicar en GitHub Pages

Settings > Pages > Deploy from a branch > `main` / `(root)`. El archivo `.nojekyll` ya está incluido.

## Agregar temas

Edita `data/temas.json`, un objeto por tema:

```json
{"id":"normativa","titulo":"Marco normativo","icono":"⚖️","color":"#6C5CE7","descripcion":"..."}
```

Cada tema carga `data/<id>.json`. Si el archivo no existe o es inválido, el tema se omite.

## Agregar preguntas

`data/<id>.json` es un arreglo de preguntas:

```json
{
  "id": "normativa-01",
  "tema": "normativa",
  "subtema": "Decreto 1278",
  "dificultad": 2,
  "tipo": "conocimiento",
  "contexto": "Texto o tabla opcional.\nUsa | para columnas.",
  "enunciado": "Pregunta...",
  "opciones": ["A", "B", "C", "D"],
  "correcta": 1,
  "explicacion": "Por qué es correcta.",
  "fuente": "Decreto 1278 de 2002, art. 1"
}
```

- `id`: único en todo el banco.
- `dificultad`: 1, 2 o 3.
- `tipo`: `conocimiento` o `situacional`.
- `contexto`: opcional (`null` si no hay). Respeta saltos de línea; si varias líneas usan `|` o tabulaciones se muestra como tabla.
- `opciones`: 4 textos; `correcta` es el índice base 0 en ese orden.

## Licencia

MIT. Ver `LICENSE`.
