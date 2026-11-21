/**
 * Bundle a self-contained Linux Python runtime + backend for electron-builder.
 *
 * Output layout under build/bundle-linux/:
 *   python/            relocatable standalone CPython + site-packages/
 *   ort/cpu/           onnxruntime CPU wheel + deps
 *   backend/           copy of python/ backend sources
 *   manifest.json      build metadata
 */
import { execFileSync } from "child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PY_VERSION = process.env.LUMINA_LINUX_PY || "3.12";

const variantArg = process.argv.find((a) => a.startsWith("--variant="));
const VARIANT = (
  variantArg ? variantArg.split("=")[1] : process.env.LUMINA_LINUX_VARIANT || "cpu"
).toLowerCase();
if (VARIANT !== "cpu" && VARIANT !== "cuda") {
  throw new Error(`Unknown Linux variant '${VARIANT}' (expected cpu|cuda)`);
}
const OUT = path.join(ROOT, "build", `bundle-linux-${VARIANT}`);

/** Run a command synchronously and return trimmed stdout. */
function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    encoding: "utf-8",
    stdio: opts.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    ...opts,
  });
}

/** Locate (or install) a standalone relocatable Python managed by uv. */
function resolveStandalonePythonRoot() {
  let pyBin = "";
  try {
    pyBin = run("uv", ["python", "find", "--managed-python", PY_VERSION], {
      capture: true,
    }).trim();
  } catch {
    console.log(`Installing standalone Python ${PY_VERSION} via uv...`);
    run("uv", ["python", "install", PY_VERSION]);
    pyBin = run("uv", ["python", "find", "--managed-python", PY_VERSION], {
      capture: true,
    }).trim();
  }
  const realBin = realpathSync(pyBin);
  // .../cpython-3.12.x-linux-x86_64-gnu/bin/python3.12 -> root dir
  return path.resolve(path.dirname(realBin), "..");
}

/** Remove unneeded stdlib/build files to minimize bundle size. */
function prunePython(pyRoot) {
  const libDir = path.join(pyRoot, "lib");
  const pySub = readdirSync(libDir).find((d) => d.startsWith("python3."));
  const stdlib = pySub ? path.join(libDir, pySub) : null;

  const dropPaths = [
    path.join(pyRoot, "include"),
    path.join(pyRoot, "share"),
    ...(stdlib
      ? [
          path.join(stdlib, "test"),
          path.join(stdlib, "idlelib"),
          path.join(stdlib, "tkinter"),
          path.join(stdlib, "turtledemo"),
          path.join(stdlib, "ensurepip"),
          path.join(stdlib, "pydoc_data"),
          path.join(stdlib, "unittest"),
        ]
      : []),
  ];
  for (const p of dropPaths) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }

  // Strip __pycache__ and static libraries (.a)
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (entry === "__pycache__") {
          rmSync(full, { recursive: true, force: true });
        } else {
          walk(full);
        }
      } else if (entry.endsWith(".a") || entry.endsWith(".pyc")) {
        rmSync(full, { force: true });
      }
    }
  };
  walk(pyRoot);
}

/** Copy python/ backend sources excluding caches and tests. */
function copyBackend(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src)) {
    if (entry === "__pycache__" || entry === "tests" || entry.endsWith(".pyc")) {
      continue;
    }
    const s = path.join(src, entry);
    const d = path.join(dst, entry);
    if (statSync(s).isDirectory()) {
      copyBackend(s, d);
    } else {
      cpSync(s, d);
    }
  }
}

/** Generate assets/icon.png from assets/icon.ico using bundled Pillow. */
function ensurePngIcon(pyBin, sitePkgs) {
  const ico = path.join(ROOT, "assets", "icon.ico");
  const png = path.join(ROOT, "assets", "icon.png");
  if (!existsSync(ico) || existsSync(png)) return;
  console.log("Generating assets/icon.png from assets/icon.ico...");
  run(
    pyBin,
    [
      "-c",
      `import sys; sys.path.insert(0, ${JSON.stringify(sitePkgs)}); ` +
        `from PIL import Image; im = Image.open(${JSON.stringify(ico)}); ` +
        `im.save(${JSON.stringify(png)}, format="PNG")`,
    ],
  );
}

function main() {
  console.log(`Building Linux backend bundle (${VARIANT})...`);
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  // 1. Copy standalone Python runtime
  const srcPyRoot = resolveStandalonePythonRoot();
  const pyRoot = path.join(OUT, "python");
  console.log(`Copying standalone Python from ${srcPyRoot}`);
  cpSync(srcPyRoot, pyRoot, { recursive: true, verbatimSymlinks: true });
  prunePython(pyRoot);

  const pyBin = path.join(pyRoot, "bin", "python3");
  const sitePkgs = path.join(pyRoot, "site-packages");
  const ortDir = path.join(OUT, "ort", VARIANT);
  mkdirSync(sitePkgs, { recursive: true });
  mkdirSync(ortDir, { recursive: true });

  // 2. Install backend dependencies into python/site-packages
  console.log("Installing backend Python packages...");
  run("uv", [
    "pip",
    "install",
    "--python",
    pyBin,
    "--target",
    sitePkgs,
    "--no-compile",
    "-r",
    path.join(ROOT, "scripts", "requirements-backend.txt"),
  ]);

  // 3. Install ONNX Runtime (CPU or CUDA) into ort/<variant>
  const ortPkg =
    VARIANT === "cuda" ? "onnxruntime-gpu[cuda,cudnn]" : "onnxruntime";
  console.log(`Installing ${ortPkg}...`);
  run("uv", [
    "pip",
    "install",
    "--python",
    pyBin,
    "--target",
    ortDir,
    "--no-compile",
    ortPkg,
  ]);

  // Remove __pycache__ from installed targets
  prunePython(pyRoot);

  // 4. Generate PNG icon for Linux desktop/window if needed
  ensurePngIcon(pyBin, sitePkgs);

  // 5. Copy backend sources
  copyBackend(path.join(ROOT, "python"), path.join(OUT, "backend"));

  // 6. Verify imports via bundled Python
  console.log("Verifying bundled Python imports...");
  const ortVer = run(
    pyBin,
    [
      "-c",
      "import os, sys; " +
        "sys.path[:0] = os.environ['LUMINA_PYTHONPATH'].split(os.pathsep); " +
        "import fastapi, uvicorn, cv2, PIL, numpy, yaml, openai, tokenizers, onnxruntime as ort; " +
        "print(ort.__version__)",
    ],
    {
      capture: true,
      env: {
        ...process.env,
        LUMINA_PYTHONPATH: `${ortDir}${path.delimiter}${sitePkgs}`,
      },
    },
  ).trim();

  // 7. Write manifest
  writeFileSync(
    path.join(OUT, "manifest.json"),
    JSON.stringify(
      {
        variant: VARIANT,
        platform: "linux-x64",
        python: PY_VERSION,
        onnxruntime: ortVer,
        backend: "resources/backend (from python/)",
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  console.log(`Linux bundle ready at ${OUT} (variant=${VARIANT}, onnxruntime ${ortVer})`);
}

main();
