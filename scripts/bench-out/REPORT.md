# Benchmark de modelos de embeddings — NoteFlow "related"

**Método:** se re-embebieron las **33 secciones de tus 12 notas reales** con cada modelo, usando
exactamente la tubería de producción (mean pooling, normalización L2, prefijo `passage:` para e5,
centrado por la media global, umbral 0.03). Para cada modelo se midieron KPIs objetivos y se
volcaron todas las relaciones para un juicio cualitativo (lectura manual de las relaciones).

## KPIs

| Modelo | dim | anisotropía ↓ | avgTop1 ↑ | margen | veredicto |
|---|---|---|---|---|---|
| multilingual-e5-small | 384 | 0.830 | 0.352 | 0.125 | base, conservador |
| multilingual-e5-base | 768 | 0.806 | 0.330 | 0.107 | = small, doble coste ❌ |
| paraphrase-MiniLM-L12-v2 | 384 | **0.348** | **0.548** | 0.119 | separa mucho, algo ruidoso |
| **paraphrase-mpnet-base-v2** | 768 | **0.326** | 0.447 | 0.122 | **ganador** ✅ |

- **anisotropía** = parecido medio entre TODAS las secciones antes de centrar. Más bajo = los
  vectores están más repartidos = discrimina mejor. Los `e5` lo meten todo en un cono (0.81–0.83);
  los `paraphrase` separan de verdad (0.33–0.35).
- **avgTop1** = fuerza del mejor match tras centrar. **coverage** fue 100% y **avgRelated** ~5.6 en
  todos (con 12 notas el umbral deja pasar ~6) → no discrimina a este tamaño, no se usa.
- **velocidad**: el tiempo/medido está dominado por la carga inicial del modelo (una vez), no es
  representativo; en uso real el indexado es incremental y con debounce, así que da igual.
- **tamaño**: 384-d vs 768-d. A esta escala (33 secciones = ~100 KB; 10k = ~30 MB) es irrelevante.

## Juicio cualitativo (leyendo tus relaciones reales)

- **e5-small / e5-base:** clusters intra-proyecto correctos (EAV↔EAV, NOTEFLOW↔NOTEFLOW) pero
  similitudes comprimidas y **flojos en cruces entre proyectos**. La tríada de visión
  (rfdetr ↔ EAV ↔ NTI) apenas aflora. e5-base no mejora a e5-small y pesa el doble → descartado.
- **MiniLM:** separa muy bien, pero **cruza demasiado por "registro"**: junta todas las secciones
  tipo prompt/instrucción de proyectos distintos en un mismo bloque. Ej. `EAV[Prompts] → NOTEFLOW[Features]`
  con 0.828 (confiado pero temáticamente erróneo). Más recall, menos precisión.
- **mpnet (ganador):** mantiene los clusters de proyecto **apretados** (EAV sigue EAV, NoteFlow sigue
  NoteFlow) **y** saca los cruces **correctos** que dan valor al "cerebro":
  - `Project NTI[Note] → EAV[Info]` (0.463) y `rfdetr[AMI] → EAV[FAT]` (0.320) → la tríada de
    visión por computador, que e5 no veía y MiniLM ensuciaba.
  - `Contexto[yago] → NOTEFLOW[noteflow-context]` (0.450) → perfil de usuario ligado a su proyecto.
  - NO crea el bloque-prompt espurio de MiniLM: `EAV[Prompts] → EAV[BBDD]/[Entreno]` (se queda en EAV).

> Nota: las notas basura/vacías (`fasd/pepe/asdf`, secciones "Features"/"Mensajes" sin contenido)
> generan ruido en TODOS los modelos — no es problema del modelo; el contenido real relaciona bien.

## Recomendación

**`Xenova/paraphrase-multilingual-mpnet-base-v2`** como modelo por defecto. Mejor calidad de
relaciones en tu contenido real (ES + EN + código), con el equilibrio justo entre clusters limpios
y cruces inter-proyecto útiles. Segundo: MiniLM (384-d, más rápido) si el tamaño importara — aquí
no importa.

## Aplicado

- `DEFAULT_AI_MODEL` → mpnet.
- **Dimensión dinámica:** el worker detecta la dimensión del modelo en `init`, así que cambiar
  `settings.ai.modelId` a cualquier modelo (384, 768, 1024…) funciona y reindexea solo.
- **Fallback de cuantización** (q8 → fp32) por si un modelo no trae build q8.
