# Contribuir a Lumina

Gracias por tu interés en contribuir a Lumina. Lumina es una aplicación gratuita y de código abierto para traducir manga, manhwa y manhua mediante modelos locales ONNX.

**Idiomas:** [English](CONTRIBUTING.md) | **Español**

## Preparación del entorno

### Requisitos

- Node.js 22 o superior.
- Python 3.13.
- Git.

### Instalación

```sh
git clone https://github.com/lumina-tl/lumina.git
cd lumina

python -m venv venv
venv\Scripts\pip install -r python\requirements.txt

npm install
npm run build
npm start
```

En Linux o macOS, activa el entorno virtual con `source venv/bin/activate`.

## Arquitectura

- `src/main/`: proceso principal de Electron, ciclo de vida de ventanas, backend, archivos y secretos.
- `src/preload.ts`: puente IPC aislado.
- `src/renderer/`: interfaz, canvas, pipeline, ajustes y ventanas.
- `src/shared/`: tipos compartidos y contrato IPC.
- `python/`: servidor FastAPI con ONNX Runtime y proveedores de traducción.

## Flujo de Git y ramas

1. Crea un fork del repositorio.
2. Clona tu fork y crea una rama descriptiva:

```sh
git checkout -b feat/nueva-funcion
# o
git checkout -b fix/correccion
```

3. Mantén los cambios pequeños y relacionados.
4. Ejecuta antes de enviar cambios:

```sh
npm run build
```

5. Envía la rama a tu fork y abre un Pull Request contra `main`.

## Mensajes de commit

Usa Conventional Commits:

- `feat(scope): ...`: nueva función.
- `fix(scope): ...`: corrección.
- `docs(scope): ...`: documentación.
- `refactor(scope): ...`: reorganización sin cambio de comportamiento.
- `chore(scope): ...`: dependencias, mantenimiento o publicación.

Ejemplos:

```text
feat(export): agregar exportación PDF
fix(canvas): evitar que el transformador active el pincel
```

## Créditos y atribución

Al integrar cambios de forks o repositorios externos:

1. Añade el crédito en el mensaje del commit con `Co-authored-by`.
2. Indica la fuente original en el Pull Request.
3. Registra contribuciones relevantes en [CHANGELOG.md](CHANGELOG.md).

Ejemplo:

```text
feat(export): agregar soporte de exportación PSD

Adaptado de AlanSanchez06/lumina@<hash>

Co-authored-by: Alan Sanchez <correo@example.com>
```

## Pull Requests

- Usa la plantilla incluida en el repositorio.
- Explica qué cambió y por qué.
- Describe cómo probar el cambio.
- Incluye pruebas manuales o automatizadas cuando sean necesarias.
