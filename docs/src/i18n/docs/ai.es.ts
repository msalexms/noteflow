// Copy en español de la página /ai — debe satisfacer la forma de ai.en.ts.
// Los prompts literales (system prompt del chat y prompt del perfil) se muestran
// VERBATIM en inglés en ambos idiomas: son las cadenas reales que envía la app.
import type { AiContent } from './ai.en';
import { CHAT_SYSTEM_PROMPT, PROFILE_PROMPT } from './ai.en';

export const aiEs: AiContent = {
  meta: {
    title: 'Cómo funciona la IA de NoteFlow — embeddings locales, RAG y agentes',
    description:
      'Un recorrido técnico por la IA de NoteFlow: un índice semántico 100% local (Transformers.js + sqlite-vec), el grafo de notas, recuperación híbrida RAG, el perfil de segundo cerebro y un agente nativo con tool-calling — con los prompts y umbrales reales, directos del código.',
  },

  hero: {
    kicker: 'NoteFlow · IA por dentro',
    h1: 'Dentro<br />del cerebro.',
    tagline:
      'Embeddings locales, un grafo semántico, recuperación híbrida y un agente nativo — cada prompt y cada umbral documentados, directos del código.',
  },

  toc: [
    { id: 'providers', label: 'Proveedores' },
    { id: 'embeddings', label: 'Índice local' },
    { id: 'relations', label: 'Relaciones' },
    { id: 'rag', label: 'Pipeline RAG' },
    { id: 'profile', label: 'Perfil' },
    { id: 'agent', label: 'Agente y tools' },
    { id: 'privacy', label: 'Privacidad' },
  ],

  providers: {
    title: 'Trae tu propio modelo',
    intro: [
      'NoteFlow no incluye ningún modelo — conectas <strong>tu</strong> proveedor, y con tu propia key o un Ollama local nada pasa por servidores de NoteFlow (solo la suscripción gestionada opcional <strong>NoteFlow AI</strong> usa el proxy de NoteFlow). Dos implementaciones lo cubren todo: Anthropic mediante el <strong>SDK oficial</strong>, y un cliente <strong>OpenAI-compatible</strong> (streaming de <code>/chat/completions</code>) que habla con todos los demás, desde la propia OpenAI hasta un Ollama local.',
      'Cada preset guarda su <strong>propia</strong> API key, modelo y base URL, así que cambiar de proveedor nunca mezcla credenciales. La base URL es editable en todos los presets salvo Anthropic — apúntala a un endpoint regional o a un gateway autoalojado.',
    ],
    cards: [
      {
        name: 'Anthropic (Claude)',
        endpoint: 'SDK oficial',
        note: 'Integración nativa vía <code>@anthropic-ai/sdk</code>. El único preset que acepta adjuntos PDF; endpoint fijo.',
        badges: ['API key', 'imágenes', 'PDF'],
      },
      {
        name: 'OpenAI',
        endpoint: 'api.openai.com/v1',
        note: 'La familia GPT sobre la API estándar de chat-completions.',
        badges: ['API key', 'imágenes'],
      },
      {
        name: 'DeepSeek',
        endpoint: 'api.deepseek.com/v1',
        note: '<code>deepseek-chat</code> / <code>deepseek-reasoner</code>. Solo texto — la API rechaza la entrada de imágenes.',
        badges: ['API key', 'solo texto'],
      },
      {
        name: 'MiniMax',
        endpoint: 'api.minimax.io/v1',
        note: 'MiniMax-Text-01. Edita la base URL para usar el endpoint de China. Solo texto.',
        badges: ['API key', 'solo texto'],
      },
      {
        name: 'Moonshot (Kimi)',
        endpoint: 'api.moonshot.ai/v1',
        note: 'Kimi K2 y los modelos moonshot-v1. Solo texto.',
        badges: ['API key', 'solo texto'],
      },
      {
        name: 'OpenRouter',
        endpoint: 'openrouter.ai/api/v1',
        note: 'Una key, cientos de modelos — elige cualquier id de modelo en el selector.',
        badges: ['API key', 'imágenes'],
      },
      {
        name: 'OpenCode Zen',
        endpoint: 'opencode.ai/zen/go/v1',
        note: 'El gateway de OpenCode, totalmente OpenAI-compatible.',
        badges: ['API key', 'imágenes'],
      },
      {
        name: 'Ollama (local)',
        endpoint: 'localhost:11434/v1',
        note: 'Inferencia 100% local — sin key, sin cuenta, nada sale nunca de tu máquina.',
        badges: ['sin key', 'local', 'imágenes'],
      },
      {
        name: 'Custom (OpenAI-compatible)',
        endpoint: 'tu base URL',
        note: 'Cualquier servidor OpenAI-compatible: LM Studio, vLLM, llama.cpp, un gateway corporativo…',
        badges: ['key opcional', 'imágenes'],
      },
    ],
    capsP:
      'El soporte de adjuntos sigue al preset, porque la visión depende en realidad del <em>modelo</em>: la entrada de imágenes viene activada por defecto en los proveedores con visión o flexibles de modelo, y desactivada en los de solo texto (DeepSeek, MiniMax, Moonshot — sus APIs rechazan <code>image_url</code> con un HTTP 400). <strong>Los adjuntos PDF son exclusivos de Anthropic.</strong> Los archivos de texto y código se incrustan como texto plano y funcionan con cualquier proveedor.',
    keysCallout: {
      title: 'Tus keys nunca tocan la interfaz',
      html:
        'Las API keys se cifran con el almacén de claves del sistema operativo (<code>safeStorage</code> de Electron) y viven solo en el proceso principal — la interfaz nunca ve una key, solo un flag <code>hasKey</code>. Y con <strong>Ollama</strong> no hay key en absoluto: combina un modelo local con el índice local de abajo y toda la capa de IA corre en tu máquina.',
    },
  },

  embeddings: {
    title: 'Un índice semántico local',
    intro: [
      'Todo lo que el cerebro sabe empieza en un índice <strong>100% local y offline</strong>. NoteFlow embebe tus notas con <strong>Transformers.js</strong> sobre el <code>onnxruntime</code> nativo — en un proceso utilitario aparte, para que la app nunca se bloquee — usando <code>Xenova/paraphrase-multilingual-mpnet-base-v2</code>: un modelo multilingüe que produce vectores de <strong>768 dimensiones</strong>, descargado una sola vez al activarlo (la IA local viene apagada por defecto).',
      'La unidad de significado es la <strong>sección</strong>, no la nota: cada sección de cada nota se convierte en su propio embedding, guardado en una base SQLite con <code>sqlite-vec</code> para los vectores y <code>FTS5</code> para el texto completo.',
    ],
    diagram: {
      caption: 'El pipeline de indexado — cada paso corre en tu máquina.',
      note: 'nota',
      noteSub: 'markdown en disco',
      sections: 'secciones',
      sectionsSub: 'un embedding cada una',
      vector: '768-d',
      vectorLabel: 'embedding',
      vectorSub: 'multilingüe · local',
      store: 'sqlite-vec · fts5',
      storeSub: 'fuera del dir de notas',
    },
    bullets: [
      'Antes de embeber, cada sección se limpia: se eliminan las imágenes base64 y el texto se trunca a <strong>~2.000 caracteres</strong> (≈ 512 tokens — el modelo ignora todo lo que pase de ahí de todos modos).',
      'El indexado es <strong>incremental</strong>: un hash de contenido por sección salta lo que no cambió, y las ediciones se reindexan unos <strong>2,5&nbsp;s</strong> después de dejar de escribir.',
      'Las notas cifradas <strong>nunca se indexan</strong> — nada de su texto plano entra jamás en la base de datos.',
      'La base de datos vive en la carpeta de datos de la app, <strong>fuera del directorio de notas</strong> — nunca se commitea ni se sincroniza a GitHub.',
      'El índice es un artefacto desechable: bórralo y se reconstruye solo desde el markdown en disco.',
    ],
  },

  relations: {
    title: 'Cómo se conectan las notas en el cerebro',
    intro: [
      'La similitud cruda entre embeddings engaña: los vectores de frases se apiñan en un cono estrecho (<em>anisotropía</em>), así que todo se parece vagamente a todo. NoteFlow primero <strong>centra cada vector sobre la media global</strong> de tus propias notas y después compara con coseno — lo que sobrevive es la parte del significado que hace a una nota <em>distinta</em> de tu nota media.',
    ],
    cards: [
      {
        title: 'Notas relacionadas — por sección',
        html:
          'Para la sección que estás editando, su vector centrado se compara contra todas las demás secciones. De cada otra nota solo sobrevive la <strong>sección que mejor casa</strong>, y solo por encima de una similitud post-centrado de <strong>0,03</strong> — un listón deliberadamente estricto que mantiene el panel “Related” temático en vez de parlanchín.',
      },
      {
        title: 'Grafo de contenido — nota ↔ nota',
        html:
          'Para la vista cerebro, cada nota se colapsa al <strong>centroide</strong> de los vectores de sus secciones, centrado y normalizado igual. Cada pareja de notas por encima de <strong>0,05</strong> se convierte en arista candidata, y luego las aristas se podan al <strong>top&nbsp;6</strong> de cada nota (se conservan si cualquiera de los dos extremos las clasifica) para que las notas-hub no se conviertan en bolas de pelo.',
      },
    ],
    layersP:
      'El grafo que ves tiene dos capas: la capa de <strong>estructura</strong> (grupo → carpeta → nota, dibujada de cómo organizas de verdad) y esta capa de <strong>contenido</strong> (aristas semánticas). Un índice, la misma matemática — y la recuperación del chat de abajo reutiliza ambas.',
  },

  rag: {
    title: 'Solo las notas relevantes llegan al modelo',
    intro: [
      'Cuando le preguntas algo al chat, tu cuaderno <em>no</em> se pega entero en el prompt. Un pipeline de recuperación elige las pocas secciones que importan:',
    ],
    steps: [
      {
        title: 'Búsqueda híbrida',
        desc:
          'La pregunta se embebe <strong>en local</strong> y se lanza contra ambos índices — similitud vectorial y coincidencia de palabras clave FTS5 — y los dos rankings se fusionan con Reciprocal Rank Fusion (<strong>RRF, k&nbsp;=&nbsp;60</strong>). Sobreviven los 6 mejores resultados por nota.',
      },
      {
        title: 'Expansión por el grafo',
        desc:
          'Se suman hasta 3 vecinas conectadas a esos resultados por <a href="#relations">aristas de contenido</a> — notas que no mencionaste, pero que el grafo sabe que van de lo mismo.',
      },
      {
        title: 'Frescas del disco',
        desc:
          'Las secciones encontradas se releen del markdown en disco (nunca del índice), con un tope de 1.500 caracteres por bloque.',
      },
      {
        title: 'Un solo system prompt',
        desc:
          'Los bloques se añaden como contexto al system prompt del chat y la respuesta llega en streaming. <strong>Solo tu pregunta y estos fragmentos recuperados salen de tu máquina.</strong>',
      },
    ],
    diagram: {
      caption: 'El pipeline RAG — solo la pregunta y los fragmentos recuperados llegan al proveedor.',
      question: 'pregunta',
      questionSub: 'embebida en local',
      search: 'búsqueda híbrida',
      searchSub: 'vector + fts5 · rrf k=60',
      graph: 'vecinas del grafo',
      graphSub: 'aristas de contenido',
      context: 'contexto',
      contextSub: 'secciones del disco',
      llm: 'LLM',
      llmSub: 'tu proveedor',
      answer: 'respuesta + fuentes',
      answerSub: 'iluminadas en el cerebro',
    },
    sourcesP:
      'El chat emite sus <strong>fuentes</strong> antes de que llegue el primer token, y las notas citadas literalmente <strong>se encienden</strong> en la vista cerebro — puedes ver de dónde sale cada respuesta.',
    profileP:
      'Tu nota de perfil (siguiente sección) se inyecta como <strong>trasfondo invisible</strong> en cada pregunta, sea o no relevante semánticamente — pero nunca se cita como fuente ni se ilumina.',
    prompt: {
      summary: 'El system prompt literal del chat',
      note:
        'Verbatim del código (<code>CHAT_SYSTEM_BASE</code>, <code>electron/main.ts</code>), en inglés porque es la cadena real que se envía. El contexto recuperado y el bloque de perfil se añaden debajo.',
      text: CHAT_SYSTEM_PROMPT,
    },
  },

  profile: {
    title: 'El perfil del segundo cerebro',
    intro: [
      'La pestaña <strong>Profile</strong> del panel de IA guarda un cuestionario corto en cuatro secciones — <strong>Professional</strong>, <strong>Personal</strong>, <strong>Your style</strong> y <strong>Working with the AI</strong> — y convierte tus respuestas en una nota de perfil que el asistente lee como trasfondo a partir de entonces. Nada te salta encima: el cerebro siempre aterriza en el chat, y el cuestionario lo abres tú cuando te apetece.',
      '<strong>Lo indirecto gana a lo directo.</strong> Preguntar “¿eres creativo?” da una mala respuesta; pedir música, cine y libros favoritos, un viaje soñado o binarias juguetonas de “esto o lo otro” da señal honesta. Las binarias están diseñadas para tap-ear las dimensiones del <strong>Big Five</strong> (OCEAN), y al modelo se le indica explícitamente que las trate como <strong>priors suaves</strong> — tendencias modestas y probabilísticas que solo cuajan cuando convergen varias pistas, nunca veredictos.',
      'También puedes adjuntar un CV o cualquier PDF, imágenes y enlaces. Los documentos van a tu proveedor <strong>en nativo</strong> (bloques de documento/visión) — la app nunca los procesa en local. Los enlaces se descargan, se reducen a texto legible y se incluyen como contexto.',
      'La nota generada te describe en <strong>rasgos y valores abstractos</strong> — lo que un favorito <em>representa</em>, nunca su título — para que el asistente no suelte tu película favorita en chats que no vienen a cuento. Los favoritos literales quedan en cuarentena en una sección final llamada <em>“Soft signals (raw — do not cite)”</em>, marcada como solo-trasfondo.',
      '¿No te convence el resultado? Regenerar <strong>reutiliza la misma nota</strong> en vez de crear duplicados.',
    ],
    prompt: {
      summary: 'El prompt literal de generación del perfil',
      note:
        'Verbatim del código (el handler <code>ai:profile-generate</code>, <code>electron/main.ts</code>), en inglés porque es la cadena real que se envía. <code>${locale}</code> se sustituye por el idioma de tu app en tiempo de ejecución.',
      text: PROFILE_PROMPT,
    },
  },

  agent: {
    title: 'Un agente sobre tus notas',
    intro: [
      'El chat no solo habla de tus notas — puede <strong>actuar</strong> sobre ellas. Esto <strong>no</strong> es un envoltorio del CLI de NoteFlow: el modelo usa <strong>function calling</strong> nativo, y cada tool se ejecuta dentro del proceso principal de la app por los mismos caminos de código que usa la interfaz — mismas escrituras, misma sincronización con GitHub, mismo reindexado.',
      'El bucle agéntico realimenta cada resultado de tool al modelo hasta que deja de llamar tools, con un tope duro de <strong>12 pasos</strong> por turno. Las 17 tools están siempre disponibles — decide el modelo — pero las cuatro destructivas están vigiladas:',
    ],
    bullets: [
      'Las llamadas destructivas pausan el turno con una <strong>confirmación explícita</strong> en el chat que muestra el objetivo resuelto — el <em>título</em> real de la nota o el grupo, no un id opaco — para cazar un borrado equivocado antes de que ocurra.',
      'Si rechazas, el agente <strong>no se aborta</strong>: la tool devuelve “user declined” y el modelo sigue con el resto de la tarea.',
      'Los ids se <strong>auto-corrigen</strong>: cuando una tool reporta un id de nota caducado, el error lleva la lista viva id ↔ título, así que el modelo se corrige en el siguiente paso en vez de quedarse atascado.',
      'Las notas cifradas aparecen en los listados, pero ninguna tool puede leer ni editar su contenido.',
    ],
    colTool: 'Tool',
    colDesc: 'Qué hace',
    destructiveBadge: 'destructiva',
    tools: [
      { name: 'list_notes', desc: 'Lista las notas — id, título, tags, grupo/carpeta y nombres de sección. Así descubre el agente los ids reales antes de actuar.' },
      { name: 'get_note', desc: 'Lee una nota completa, incluyendo id, nombre y contenido de cada sección.' },
      { name: 'list_groups', desc: 'Lista todos los grupos y carpetas con sus ids.' },
      { name: 'search_notes', desc: 'Búsqueda semántica sobre las notas (requiere el índice local activado).' },
      { name: 'create_note', desc: 'Crea una nota — opcionalmente dentro de un grupo/carpeta, con secciones pre-rellenadas.' },
      { name: 'update_note', desc: 'Actualiza metadatos: título, flags de favorito/archivado, o mueve la nota entre grupo y carpeta.' },
      { name: 'add_section', desc: 'Añade una sección nueva a una nota existente.' },
      { name: 'update_section', desc: 'Reemplaza el contenido de una sección.' },
      { name: 'rename_section', desc: 'Renombra una sección.' },
      { name: 'create_group', desc: 'Crea un grupo (con color opcional).' },
      { name: 'create_folder', desc: 'Crea una carpeta dentro de un grupo.' },
      { name: 'rename_group', desc: 'Renombra un grupo.' },
      { name: 'rename_folder', desc: 'Renombra una carpeta.' },
      { name: 'delete_note', desc: 'Borra permanentemente una nota y todas sus secciones.', destructive: true },
      { name: 'delete_section', desc: 'Borra una sección de una nota.', destructive: true },
      { name: 'delete_group', desc: 'Borra un grupo y sus carpetas — las notas sobreviven, solo quedan sin grupo.', destructive: true },
      { name: 'delete_folder', desc: 'Borra una carpeta — sus notas conservan el grupo.', destructive: true },
    ],
  },

  privacy: {
    title: 'Lo que la IA nunca ve',
    intro: [
      'Todas las superficies de IA — índice, recuperación, tools — respetan los mismos límites, aplicados en el proceso principal, no en la interfaz:',
    ],
    items: [
      {
        title: 'Secciones ocultas',
        html:
          'Marca cualquier sección como <em>“Hide from AI”</em> y sale de <strong>todas</strong> las superficies de IA a la vez: no se indexa (y se borra del índice si ya lo estaba), nunca entra al contexto del chat — ni siquiera por la expansión de vecinas del grafo — y las tools del agente la omiten. El modelo ni siquiera ve su id de sección, así que no puede leerla ni editarla.',
      },
      {
        title: 'Notas cifradas',
        html:
          'Fuera del índice, fuera de la recuperación y fuera de las lecturas de tools. Pueden aparecer en los listados por título, pero su texto plano nunca llega al índice — y mucho menos a un proveedor.',
      },
      {
        title: 'El índice no sale de casa',
        html:
          'Los embeddings viven en un fichero SQLite local fuera de tu directorio de notas: nunca se sincroniza a GitHub, nunca se sube a ningún sitio. Borrarlo solo te cuesta un reindexado.',
      },
      {
        title: 'Keys bajo llave',
        html:
          'Las API keys de los proveedores se cifran con el almacén de claves del SO y quedan confinadas al proceso principal — ver <a href="#providers">proveedores</a>.',
      },
    ],
    switchesP:
      'Y toda la capa es opt-in, detrás de <strong>dos interruptores independientes</strong>: los <strong>embeddings locales</strong> alimentan las notas relacionadas, el grafo de contenido y el RAG; un <strong>proveedor LLM</strong> configurado alimenta el chat y la generación. Cada uno funciona sin el otro — el chat sin índice simplemente responde sin el contexto de tus notas, y el índice solo te da notas relacionadas y el cerebro sin nube de por medio.',
  },
};
