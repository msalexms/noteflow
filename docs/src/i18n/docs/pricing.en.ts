// English copy for the /pricing docs page (source of truth for the shape:
// `PricingContent = typeof pricingEn`, see pricing.es.ts). Strings with inline HTML
// are rendered with `set:html` in PricingPage.astro; %AI_PROVIDERS_URL% /
// %AI_PRIVACY_URL% placeholders are filled with locale-aware links there.
// All facts (plans, curated models, quota, Cloud status) come from
// .claude/context/monetization.md — no price figures are published on purpose
// (pricing is shown at checkout).

export const pricingEn = {
  meta: {
    title: 'NoteFlow pricing — free forever, plus optional managed plans',
    description:
      'NoteFlow is free and everything essential stays free. Two optional subscriptions exist for convenience only — NoteFlow AI (managed LLM, available now) and NoteFlow Cloud (E2EE sync, coming soon) — and both capabilities can be had for free by self-managing.',
  },

  hero: {
    kicker: 'NoteFlow · Pricing',
    h1: 'Free.<br />Forever.',
    tagline:
      'Everything essential is free and stays free. The paid plans buy convenience, not capability — anything they do, you can self-manage at no cost.',
  },

  toc: [
    { id: 'free', label: 'Free forever' },
    { id: 'ai', label: 'NoteFlow AI' },
    { id: 'cloud', label: 'NoteFlow Cloud' },
    { id: 'compare', label: 'Managed vs DIY' },
    { id: 'privacy', label: 'Privacy' },
  ],

  free: {
    title: 'Everything essential is free',
    intro: [
      'NoteFlow is local-first: your notes are plain <code>.md</code> files on your machine, and the whole product works without an account, a server or a subscription. This is the full app — not a trial tier.',
    ],
    cards: [
      {
        title: 'Editor & organization',
        html: 'The markdown editor, groups → folders → notes → sections, templates, sticky notes, views and shortcuts — all of it.',
      },
      {
        title: 'The Brain',
        html: 'The semantic index, note graph and related sections run <strong>100% locally</strong> — embeddings are computed on your machine, no cloud involved.',
      },
      {
        title: 'AI chat & agent',
        html: 'Bring your own model: run <strong>Ollama</strong> locally (no key, fully offline) or use your own API key from any of the <a href="%AI_PROVIDERS_URL%">9 supported providers</a>.',
      },
      {
        title: 'Encryption',
        html: 'Per-note AES-256-GCM encryption with your passphrase. No backdoor, no plan required.',
      },
      {
        title: 'GitHub Sync',
        html: 'Sync between devices through your own private GitHub repo. Free, self-managed, yours.',
      },
      {
        title: 'CLI',
        html: 'The companion CLI reads and edits the same notes from your terminal — and from your coding agents.',
      },
    ],
    keep: {
      title: 'Plans add, they never replace',
      html: 'The two subscriptions below are <strong>managed alternatives</strong> for people who don’t want to run anything themselves. The free routes — a local model, your own key, GitHub Sync — stay first-class and keep working exactly as they do today.',
    },
  },

  ai: {
    badge: 'Available now',
    title: 'NoteFlow AI — the managed model',
    intro: [
      'The AI chat needs a language model. The free routes: run one locally with Ollama, or paste your own API key. <strong>NoteFlow AI</strong> is the third route, for people who don’t want to deal with either — a model managed by NoteFlow that just works the moment you subscribe.',
    ],
    bullets: [
      'No Ollama to install, no third-party account, no API key to buy, store or rotate.',
      'A monthly token quota is included — <strong>3M tokens per month</strong> by default.',
      'Monthly or annual subscription. Subscribe from inside the app: <strong>Settings → Account → Subscribe</strong> — checkout opens in your browser (handled by Lemon Squeezy, our merchant of record) and shows the price there.',
      'Once the payment goes through, NoteFlow AI activates itself as your provider — nothing to configure.',
    ],
    modelsTitle: 'Curated models',
    models: [
      'openai/gpt-4o-mini',
      'openai/gpt-4.1-mini',
      'anthropic/claude-haiku-4.5',
      'google/gemini-2.5-flash',
    ],
    modelsNote:
      'All curated models support tool-calling (the agent) and vision (image attachments).',
    alt: {
      title: 'The free way to the same capability',
      html: 'Run a local model with <strong>Ollama</strong> — nothing ever leaves your machine — or bring your own API key from any supported provider. Same chat, same agent, same features; you just manage the model yourself.',
    },
  },

  cloud: {
    badge: 'Coming soon',
    title: 'NoteFlow Cloud — E2EE note sync',
    intro: [
      '<strong>NoteFlow Cloud</strong> is the upcoming managed sync: real-time sync between devices, with none of the push/pull friction of a git-based flow.',
      'It is <strong>end-to-end encrypted by design</strong>: notes are encrypted on your device and the server only ever stores ciphertext — not even the operator can read them.',
    ],
    bullets: [
      'Real-time: changes propagate as you write — no periodic pulls, no manual pushes.',
      'Full E2EE: keys live on your devices; the server never sees a readable note.',
      'For people who don’t want to create and manage a GitHub repo just to sync notes.',
    ],
    alt: {
      title: 'GitHub Sync stays free',
      html: 'The existing <strong>GitHub Sync</strong> against your own private repo keeps working and stays free — Cloud is a smoother alternative on top of it, not a replacement.',
    },
  },

  compare: {
    title: 'Managed vs self-managed',
    intro: [
      'Same capabilities, two ways to get them. Pick per capability — they mix freely, and switching is never locked.',
    ],
    cols: {
      capability: 'Capability',
      managed: 'Managed (subscription)',
      self: 'Self-managed (free)',
    },
    rows: [
      {
        capability: 'AI model',
        managed: '<strong>NoteFlow AI</strong> — curated models, zero setup, token quota included',
        self: '<strong>Ollama</strong> locally (no key, offline) or your own API key from any of the 9 supported providers',
      },
      {
        capability: 'Setup & upkeep',
        managed: 'None — subscribe in-app and it activates itself',
        self: 'Install Ollama, or create a provider account and manage a key',
      },
      {
        capability: 'Note sync',
        managed: '<strong>NoteFlow Cloud</strong> (coming soon) — real-time, end-to-end encrypted',
        self: '<strong>GitHub Sync</strong> with your own private repo',
      },
      {
        capability: 'Everything else',
        managed: 'Free for everyone — editor, the Brain, encryption, stickies, CLI',
        self: 'Same — no plan involved',
      },
    ],
  },

  privacy: {
    title: 'Privacy with the managed AI',
    intro: [
      'Subscribing to NoteFlow AI does not change the local-first architecture — the boundaries documented in <a href="%AI_PRIVACY_URL%">How the AI works → privacy</a> hold exactly the same.',
    ],
    items: [
      {
        title: 'The index never leaves',
        html: 'The semantic index — embeddings, graph, search — is built and stored <strong>100% on your machine</strong>. Subscribing changes nothing about it.',
      },
      {
        title: 'Same data as with your own key',
        html: 'What travels to the NoteFlow proxy is exactly what would travel to any provider you use with your own key: your question plus the retrieved note fragments.',
      },
      {
        title: 'Hidden stays hidden',
        html: 'Sections marked <em>Hide from AI</em> and encrypted notes are excluded from the index, so they are never sent — to NoteFlow AI or to any other provider.',
      },
      {
        title: 'Independent subsystems',
        html: 'NoteFlow AI does not route through the notes cloud: the managed AI and NoteFlow Cloud are separate subsystems. Using one never implies the other.',
      },
    ],
  },
};

export type PricingContent = typeof pricingEn;
