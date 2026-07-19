// English copy for the /ai docs page (source of truth for the shape:
// `AiContent = typeof aiEn`, see ai.es.ts). Strings with inline HTML are rendered
// with `set:html` in AiPage.astro. All facts (presets, thresholds, tool names, agent
// behaviour) are taken verbatim from electron/ai/* and electron/main.ts — verify
// there before editing numbers.

// ── The REAL prompts, verbatim from the source. They are shown in English on BOTH
//    locales (they are the literal strings the app sends), so ai.es.ts imports them. ──

// CHAT_SYSTEM_BASE in electron/main.ts. RAG context and the profile block are appended below it.
export const CHAT_SYSTEM_PROMPT = `You are NoteFlow's assistant — a second brain over the user's personal notes. Answer directly and concisely, in the same language the user writes in. When context from the notes is provided, ground your answer in it and avoid inventing facts; if the notes don't contain the answer, say so plainly.

You can also ACT on the notes through the provided tools (create/edit/organize/delete notes, sections, groups and folders). Only act when the user clearly asks you to; otherwise just answer. Never invent ids — call list_notes / list_groups (or search_notes) first to discover the real ids you need. Ids are stable and never change, so if a tool reports a note/section as not found, the id is stale or mistyped: do not retry it verbatim — re-run list_notes and use the freshly returned id. When acting on several notes, fetch their ids right before you act on them (especially after creating, moving or renaming anything) and copy each id exactly. After acting, briefly tell the user what you did. Deletions require user confirmation, which the app handles automatically.

When the context includes the user's profile or personality notes (including any "soft signals" / raw favourites), use them only as BACKGROUND to tailor your tone and suggestions. Never cite where a preference comes from or name-drop the user's favourite song/film/book in an unrelated answer (do not say "since you like X…"). Make recommendations directly.

NEXT-ACTION SUGGESTIONS. At the very end of your FINAL answer (never in an intermediate turn that still calls tools), if there are genuinely useful follow-ups, append the literal marker "<!--SUGGESTIONS-->" on its own line, then 1 or 2 short, actionable next things the user might want to ask, one per line prefixed with "- ". Phrase each as a brief imperative from the USER's point of view, in the same language as your answer. Keep each suggestion VERY short so it fits on a small button: aim for 2-5 words, 6 words maximum, no trailing period (e.g. "- Reorganize into sections", "- Add a summary"). Keep them concrete and grounded in this conversation. If nothing useful applies, omit the marker entirely. Never mention the marker or these suggestions in the visible part of your answer.`;

// The system prompt of the ai:profile-generate handler in electron/main.ts.
// In the source it is a template string: \${locale} is substituted at run time.
export const PROFILE_PROMPT = `You are a perceptive profiler building a personal profile note for a "second brain" notes app. The note is later retrieved as BACKGROUND CONTEXT to tailor answers to this person, so its value is in capturing WHO THEY ARE, not in cataloguing trivia. The user may be anyone (not necessarily a developer). You are given short form answers (grouped by section), optional attached documents (CV/PDF/images) and text scraped from links. Write the profile in \${locale}.

INFER, DON'T JUST TRANSCRIBE. Many answers are intentionally INDIRECT proxies — favourite music/films/books, a dream trip, and playful "this or that" picks. Read them through validated personality psychology (the Big Five / OCEAN: openness, conscientiousness, extraversion, agreeableness, emotional stability) to infer likely TRAITS, VALUES, MOTIVATIONS and working/communication preferences. These signals are PROBABILISTIC and modest, so treat them as soft priors, never certainties: phrase inferences as tendencies ("tends to…", "likely values…", "seems energised by…"), and let multiple cues converge before you commit to a trait.

ABSTRACT AWAY THE SOURCE. The main body must describe the person in terms of traits, values and how they think and want to be treated — NOT by naming the specific media that produced the inference. Write what a favourite REPRESENTS, not its title: e.g. "drawn to introspective, character-driven stories and big-picture thinking" rather than "likes Interstellar". This keeps the assistant from awkwardly name-dropping a movie/song in unrelated conversations.

Cover BOTH professional and personal dimensions, and especially HOW they want the assistant to communicate with them (tone, length, level of detail) — capture this clearly so future answers can adapt. Stay faithful: do not invent hard specifics (names, employers, dates) that the inputs do not support.

STRUCTURE. Organize into a few clear sections; skip any with no information. Suggested: "About" (a tight summary), "How they think & what they value" (the inferred traits/values), "Communication style" (how the assistant should talk to them), "Work & focus", "Interests", and "Links" (the URLs provided). Then, ONLY if the user gave literal favourites (songs, films, books, etc.), add a FINAL section named exactly "Soft signals (raw — do not cite)" that lists them verbatim, opening with one line: "Raw references kept for background only — do not bring these up in unrelated conversations." Keep this section short and low-key.

Return ONLY a JSON object with this exact shape: {"title": string, "sections": [{"name": string, "content": string}]}. No text outside the JSON. "content" is Markdown.`;

export const aiEn = {
  meta: {
    title: "How NoteFlow's AI works — local embeddings, RAG & agents",
    description:
      "A technical tour of NoteFlow's AI: a 100% local semantic index (Transformers.js + sqlite-vec), the note graph, hybrid RAG retrieval, the second-brain profile and a native tool-calling agent — with the real prompts and thresholds, straight from the source.",
  },

  hero: {
    kicker: 'NoteFlow · AI internals',
    h1: 'Inside<br />the brain.',
    tagline:
      'Local embeddings, a semantic graph, hybrid retrieval and a native agent — every prompt and threshold documented, straight from the source.',
  },

  toc: [
    { id: 'providers', label: 'Providers' },
    { id: 'embeddings', label: 'Local index' },
    { id: 'relations', label: 'Relations' },
    { id: 'rag', label: 'RAG pipeline' },
    { id: 'profile', label: 'Profile' },
    { id: 'agent', label: 'Agent & tools' },
    { id: 'privacy', label: 'Privacy' },
  ],

  providers: {
    title: 'Bring your own model',
    intro: [
      'NoteFlow ships no bundled model — you plug in <strong>your</strong> provider, and with your own key or a local Ollama nothing routes through NoteFlow’s servers (only the optional managed <strong>NoteFlow AI</strong> subscription uses NoteFlow’s proxy). Two implementations cover everything: Anthropic through the <strong>official SDK</strong>, and an <strong>OpenAI-compatible</strong> client (streaming <code>/chat/completions</code>) that talks to everyone else, from OpenAI itself down to a local Ollama.',
      'Each preset keeps its <strong>own</strong> API key, model and base URL, so switching providers never mixes credentials. The base URL is editable on every preset except Anthropic — point it at a regional endpoint or a self-hosted gateway.',
    ],
    cards: [
      {
        name: 'Anthropic (Claude)',
        endpoint: 'official SDK',
        note: 'Native integration via <code>@anthropic-ai/sdk</code>. The only preset that accepts PDF attachments; fixed endpoint.',
        badges: ['API key', 'images', 'PDF'],
      },
      {
        name: 'OpenAI',
        endpoint: 'api.openai.com/v1',
        note: 'The GPT family over the standard chat-completions API.',
        badges: ['API key', 'images'],
      },
      {
        name: 'DeepSeek',
        endpoint: 'api.deepseek.com/v1',
        note: '<code>deepseek-chat</code> / <code>deepseek-reasoner</code>. Text-only — the API rejects image input.',
        badges: ['API key', 'text-only'],
      },
      {
        name: 'MiniMax',
        endpoint: 'api.minimax.io/v1',
        note: 'MiniMax-Text-01. Edit the base URL to use the China endpoint. Text-only.',
        badges: ['API key', 'text-only'],
      },
      {
        name: 'Moonshot (Kimi)',
        endpoint: 'api.moonshot.ai/v1',
        note: 'Kimi K2 and the moonshot-v1 models. Text-only.',
        badges: ['API key', 'text-only'],
      },
      {
        name: 'OpenRouter',
        endpoint: 'openrouter.ai/api/v1',
        note: 'One key, hundreds of models — pick any model id in the selector.',
        badges: ['API key', 'images'],
      },
      {
        name: 'OpenCode Zen',
        endpoint: 'opencode.ai/zen/go/v1',
        note: 'The OpenCode gateway, fully OpenAI-compatible.',
        badges: ['API key', 'images'],
      },
      {
        name: 'Ollama (local)',
        endpoint: 'localhost:11434/v1',
        note: '100% local inference — no key, no account, nothing ever leaves your machine.',
        badges: ['no key', 'local', 'images'],
      },
      {
        name: 'Custom (OpenAI-compatible)',
        endpoint: 'your base URL',
        note: 'Any OpenAI-compatible server: LM Studio, vLLM, llama.cpp, a corporate gateway…',
        badges: ['key optional', 'images'],
      },
    ],
    capsP:
      'Attachment support follows the preset, because vision is really <em>model</em>-dependent: image input is on by default for vision-capable or model-flexible providers, and off for the text-only ones (DeepSeek, MiniMax, Moonshot — their APIs reject <code>image_url</code> with an HTTP 400). <strong>PDF attachments are Anthropic-only.</strong> Text and code files are embedded as plain text and work with every provider.',
    keysCallout: {
      title: 'Your keys never touch the UI',
      html:
        'API keys are encrypted with the operating system\'s keystore (Electron <code>safeStorage</code>) and live only in the main process — the interface never sees a key, only a <code>hasKey</code> flag. And with <strong>Ollama</strong> there is no key at all: pair a local model with the local index below and the entire AI layer runs on your machine.',
    },
  },

  embeddings: {
    title: 'A local semantic index',
    intro: [
      'Everything the brain knows starts with a <strong>100% local, offline</strong> index. NoteFlow embeds your notes with <strong>Transformers.js</strong> on the native <code>onnxruntime</code> — inside a separate utility process, so the app never blocks — using <code>Xenova/paraphrase-multilingual-mpnet-base-v2</code>: a multilingual model producing <strong>768-dimensional</strong> vectors, downloaded once on first activation (Local AI is off by default).',
      'The unit of meaning is the <strong>section</strong>, not the note: every section of every note becomes its own embedding, stored in a SQLite database with <code>sqlite-vec</code> for the vectors and <code>FTS5</code> for full text.',
    ],
    diagram: {
      caption: 'The indexing pipeline — every step runs on your machine.',
      note: 'note',
      noteSub: 'markdown on disk',
      sections: 'sections',
      sectionsSub: 'one embedding each',
      vector: '768-d',
      vectorLabel: 'embedding',
      vectorSub: 'multilingual · local',
      store: 'sqlite-vec · fts5',
      storeSub: 'outside your notes dir',
    },
    bullets: [
      'Before embedding, each section is cleaned: base64 images are stripped and the text is truncated at <strong>~2,000 characters</strong> (≈ 512 tokens — the model ignores anything past that anyway).',
      'Indexing is <strong>incremental</strong>: a per-section content hash skips whatever didn\'t change, and edits are re-indexed about <strong>2.5&nbsp;s</strong> after you stop writing.',
      'Encrypted notes are <strong>never indexed</strong> — none of their plaintext ever enters the database.',
      'The database lives in the app\'s data folder, <strong>outside the notes directory</strong> — it is never committed nor synced to GitHub.',
      'The index is a disposable artifact: delete it and it rebuilds itself from the markdown on disk.',
    ],
  },

  relations: {
    title: 'How notes connect in the brain',
    intro: [
      'Raw embedding similarity is misleading: sentence vectors crowd into a narrow cone (<em>anisotropy</em>), so everything looks vaguely similar to everything. NoteFlow first <strong>centres every vector on the global mean</strong> of your own notes and then compares with cosine — what survives is the part of the meaning that makes a note <em>different</em> from your average note.',
    ],
    cards: [
      {
        title: 'Related notes — per section',
        html:
          'For the section you are editing, its centred vector is compared against every other section. From each other note only the <strong>best-matching section</strong> survives, and only above a post-centring similarity of <strong>0.03</strong> — a deliberately strict bar that keeps the “Related” panel topical instead of chatty.',
      },
      {
        title: 'Content graph — note ↔ note',
        html:
          'For the brain view, each note collapses to the <strong>centroid</strong> of its section vectors, centred and normalised the same way. Every note pair above <strong>0.05</strong> becomes a candidate edge, then edges are pruned to each note\'s <strong>top&nbsp;6</strong> (kept if either endpoint ranks them) so hub notes don\'t turn into hairballs.',
      },
    ],
    layersP:
      'The graph you see has two layers: the <strong>structure</strong> layer (group → folder → note, drawn from how you actually organize things) and this <strong>content</strong> layer (semantic edges). One index, same math — and the chat\'s retrieval below reuses both.',
  },

  rag: {
    title: 'Only relevant notes reach the model',
    intro: [
      'When you ask the chat something, your vault is <em>not</em> pasted into the prompt. A retrieval pipeline picks the few sections that matter:',
    ],
    steps: [
      {
        title: 'Hybrid search',
        desc:
          'The question is embedded <strong>locally</strong> and run against both indexes — vector similarity and FTS5 keyword match — and the two rankings are fused with Reciprocal Rank Fusion (<strong>RRF, k&nbsp;=&nbsp;60</strong>). The top 6 note hits survive.',
      },
      {
        title: 'Graph expansion',
        desc:
          'Up to 3 neighbours connected to those hits by <a href="#relations">content edges</a> join in — notes you didn\'t mention, but the graph knows are about the same thing.',
      },
      {
        title: 'Fresh from disk',
        desc:
          'The matched sections are re-read from the markdown on disk (never from the index), capped at 1,500 characters per block.',
      },
      {
        title: 'One system prompt',
        desc:
          'The blocks are appended to the chat\'s system prompt as context and the reply streams back. <strong>Only your question and these retrieved chunks ever leave your machine.</strong>',
      },
    ],
    diagram: {
      caption: 'The RAG pipeline — only the question and the retrieved chunks reach the provider.',
      question: 'question',
      questionSub: 'embedded locally',
      search: 'hybrid search',
      searchSub: 'vector + fts5 · rrf k=60',
      graph: 'graph neighbours',
      graphSub: 'content edges',
      context: 'context',
      contextSub: 'sections from disk',
      llm: 'LLM',
      llmSub: 'your provider',
      answer: 'answer + sources',
      answerSub: 'lit up in the brain',
    },
    sourcesP:
      'The chat emits its <strong>sources</strong> before the first token streams in, and the cited notes literally <strong>light up</strong> in the brain view — you can watch where an answer comes from.',
    profileP:
      'Your profile note (next section) is injected as <strong>invisible background</strong> on every question, regardless of semantic relevance — but it is never cited as a source and never illuminated.',
    prompt: {
      summary: 'The literal chat system prompt',
      note:
        'Verbatim from the source (<code>CHAT_SYSTEM_BASE</code>, <code>electron/main.ts</code>). Retrieved context and the profile block are appended below it.',
      text: CHAT_SYSTEM_PROMPT,
    },
  },

  profile: {
    title: 'The second brain profile',
    intro: [
      'The <strong>Profile</strong> tab of the AI panel holds a short questionnaire in four sections — <strong>Professional</strong>, <strong>Personal</strong>, <strong>Your style</strong> and <strong>Working with the AI</strong> — and turns your answers into a profile note the assistant reads as background from then on. Nothing pops up on you: the brain always lands on the chat, and you open the questionnaire when you feel like it.',
      '<strong>Indirect beats direct.</strong> Asking “are you creative?” gets a bad answer; asking for favourite music, films and books, a dream trip, or playful “this or that” picks gets honest signal. The binary picks are designed to tap the <strong>Big Five</strong> (OCEAN) personality dimensions, and the model is explicitly told to treat them as <strong>soft priors</strong> — modest, probabilistic tendencies that only firm up when several cues converge, never verdicts.',
      'You can also attach a CV or any PDF, images and links. Documents go to your provider <strong>natively</strong> (document/vision blocks) — the app never parses them locally. Links are fetched, stripped to readable text and included as context.',
      'The generated note describes you in <strong>abstract traits and values</strong> — what a favourite <em>represents</em>, never its title — so the assistant won\'t name-drop your favourite film in unrelated chats. The literal favourites are quarantined in a final section named <em>“Soft signals (raw — do not cite)”</em>, marked background-only.',
      'Not happy with the result? Regenerating <strong>reuses the same note</strong> instead of creating duplicates.',
    ],
    prompt: {
      summary: 'The literal profile-generation prompt',
      note:
        'Verbatim from the source (the <code>ai:profile-generate</code> handler, <code>electron/main.ts</code>). <code>${locale}</code> is substituted with your app language at run time.',
      text: PROFILE_PROMPT,
    },
  },

  agent: {
    title: 'An agent over your notes',
    intro: [
      'The chat doesn\'t just talk about your notes — it can <strong>act</strong> on them. This is <strong>not</strong> a wrapper around the NoteFlow CLI: the model uses native <strong>function calling</strong>, and every tool executes inside the app\'s main process through the same code paths the UI uses — same writes, same GitHub sync, same re-indexing.',
      'The agentic loop feeds each tool result back to the model until it stops calling tools, hard-capped at <strong>12 steps</strong> per turn. All 17 tools are always available — the model decides — but the four destructive ones are gated:',
    ],
    bullets: [
      'Destructive calls pause the turn with an <strong>explicit confirmation</strong> in the chat that shows the resolved target — the real <em>title</em> of the note or group, not an opaque id — so a wrong-target delete is caught before it happens.',
      'If you decline, the agent is <strong>not aborted</strong>: the tool returns “user declined” and the model carries on with the rest of the task.',
      'Ids are <strong>self-correcting</strong>: when a tool reports a stale note id, the error carries the live id ↔ title list, so the model fixes itself on the next step instead of dead-ending.',
      'Encrypted notes appear in listings, but no tool can read or edit their content.',
    ],
    colTool: 'Tool',
    colDesc: 'What it does',
    destructiveBadge: 'destructive',
    tools: [
      { name: 'list_notes', desc: 'List notes — id, title, tags, group/folder and section names. How the agent discovers real ids before acting.' },
      { name: 'get_note', desc: 'Read one note in full, including each section\'s id, name and content.' },
      { name: 'list_groups', desc: 'List all groups and folders with their ids.' },
      { name: 'search_notes', desc: 'Semantic search over the notes (requires the local index to be enabled).' },
      { name: 'create_note', desc: 'Create a note — optionally inside a group/folder, with pre-filled sections.' },
      { name: 'update_note', desc: 'Update metadata: title, favorite/archive flags, or move the note between group and folder.' },
      { name: 'add_section', desc: 'Append a new section to an existing note.' },
      { name: 'update_section', desc: 'Replace a section\'s content.' },
      { name: 'rename_section', desc: 'Rename a section.' },
      { name: 'create_group', desc: 'Create a group (with an optional color).' },
      { name: 'create_folder', desc: 'Create a folder inside a group.' },
      { name: 'rename_group', desc: 'Rename a group.' },
      { name: 'rename_folder', desc: 'Rename a folder.' },
      { name: 'delete_note', desc: 'Permanently delete a note and all its sections.', destructive: true },
      { name: 'delete_section', desc: 'Delete one section from a note.', destructive: true },
      { name: 'delete_group', desc: 'Delete a group and its folders — the notes survive, just ungrouped.', destructive: true },
      { name: 'delete_folder', desc: 'Delete a folder — its notes keep their group.', destructive: true },
    ],
  },

  privacy: {
    title: 'What the AI never sees',
    intro: [
      'Every AI surface — index, retrieval, tools — respects the same boundaries, enforced in the main process, not in the UI:',
    ],
    items: [
      {
        title: 'Hidden sections',
        html:
          'Mark any section <em>“Hide from AI”</em> and it drops out of <strong>every</strong> AI surface at once: it is not indexed (and gets deleted from the index if it already was), it never enters chat context — not even through graph-neighbour expansion — and the agent tools omit it. The model never even sees its section id, so it cannot read or edit it.',
      },
      {
        title: 'Encrypted notes',
        html:
          'Kept out of the index, out of retrieval and out of tool reads. They can show up in listings by title, but their plaintext never reaches the index — let alone a provider.',
      },
      {
        title: 'The index stays home',
        html:
          'Embeddings live in a local SQLite file outside your notes directory: never synced to GitHub, never uploaded anywhere. Deleting it costs you nothing but a re-index.',
      },
      {
        title: 'Keys under lock',
        html:
          'Provider API keys are encrypted with the OS keystore and confined to the main process — see <a href="#providers">providers</a>.',
      },
    ],
    switchesP:
      'And the whole layer is opt-in, behind <strong>two independent switches</strong>: <strong>local embeddings</strong> power related notes, the content graph and RAG; a configured <strong>LLM provider</strong> powers chat and generation. Either works without the other — chat without the index simply answers without your notes\' context, and the index alone gives you related notes and the brain with zero cloud involved.',
  },
};

export type AiContent = typeof aiEn;
