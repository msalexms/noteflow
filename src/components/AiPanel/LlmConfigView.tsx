import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Loader2, RefreshCw, X } from 'lucide-react'
import { useAiChatStore } from '../../stores/aiChatStore'
import { useT } from '../../i18n/useT'
import { tf } from '../../i18n/format'
import type { AccountStatus } from '../../types'
import { Card, FieldLabel, FIELD_INPUT } from './ui'

// Compact token figure for the NoteFlow AI usage line: 1_234_567 → "1.2M",
// 850_000 → "850k", 3_000_000 → "3M".
function formatTokens(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    return `${Number.isInteger(m) || m >= 100 ? Math.round(m) : m.toFixed(1)}M`
  }
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(n)
}

export function LlmConfigView({ embedded = false }: { embedded?: boolean } = {}) {
  const t = useT()
  const llmConfig = useAiChatStore((s) => s.llmConfig)
  const presets = useAiChatStore((s) => s.presets)
  const setLlmConfig = useAiChatStore((s) => s.setLlmConfig)
  const loadConfig = useAiChatStore((s) => s.loadConfig)
  const refreshModels = useAiChatStore((s) => s.refreshModels)
  const models = useAiChatStore((s) => s.models)
  const modelsLoading = useAiChatStore((s) => s.modelsLoading)
  const testConnection = useAiChatStore((s) => s.testConnection)

  const preset = useMemo(() => presets.find((p) => p.id === llmConfig?.active) ?? null, [presets, llmConfig?.active])
  // The managed plan gets its own card (below) instead of a <select> option — only surfaced
  // once the account has the entitlement, or if it's already active (e.g. a lapsed subscription
  // so the user can see why and switch away from the amber warning).
  const selectablePresets = useMemo(() => presets.filter((p) => p.id !== 'noteflow'), [presets])
  const modelOptions = useMemo(() => {
    const set = new Set<string>([...(preset?.suggestedModels ?? []), ...models])
    if (llmConfig?.model) set.add(llmConfig.model)
    return [...set]
  }, [preset, models, llmConfig?.model])

  const [keyInput, setKeyInput] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [account, setAccount] = useState<AccountStatus | null>(null)
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null)
  const lastActive = useRef<string | null>(null)

  // The NoteFlow AI preset gates on the account session + 'ai' entitlement:
  // track the public status and re-pull the config (its `configured` flag is
  // account-derived in main) whenever it changes.
  useEffect(() => {
    void window.noteflow.getAccountStatus().then(setAccount)
    return window.noteflow.onAccountStatusChanged((status) => {
      setAccount(status)
      void loadConfig()
    })
  }, [loadConfig])

  // Monthly consumption of the managed plan — refetched whenever the account
  // status changes (the effect above updates `account`). Silent by design: a
  // null answer (no session, offline, non-200) just hides the usage bar.
  useEffect(() => {
    if (!account?.entitlements.ai) return
    let cancelled = false
    void window.noteflow.aiLlmUsage().then((u) => { if (!cancelled) setUsage(u) })
    return () => { cancelled = true }
  }, [account])

  // Reset the editable fields whenever the active provider changes.
  useEffect(() => {
    if (llmConfig && llmConfig.active !== lastActive.current) {
      lastActive.current = llmConfig.active
      setBaseUrl(llmConfig.baseUrl)
      setKeyInput('')
      setTestResult(null)
      setModelsError(null)
    }
  }, [llmConfig])

  if (!llmConfig || !preset) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted/60">
        <Loader2 size={16} className="animate-spin" />
      </div>
    )
  }

  const changeProvider = (id: string) => { if (id !== llmConfig.active) void setLlmConfig({ active: id }) }
  // Picker label: show the model name only, dropping the "provider/" prefix
  // (openai/gpt-4o-mini → gpt-4o-mini). The stored/sent id keeps the full form
  // — this is cosmetic. Advanced NoteFlow AI models keep a "(6× quota)" suffix.
  const modelLabel = (m: string) => {
    const name = m.includes('/') ? m.slice(m.indexOf('/') + 1) : m
    const mult = preset.modelMeta?.[m]?.quotaMultiplier ?? 1
    return mult > 1 ? `${name} ${tf(t.aiPanel.provider.modelQuotaSuffix, { mult })}` : name
  }
  const saveKey = async () => { if (keyInput.trim()) { await setLlmConfig({ apiKey: keyInput.trim() }); setKeyInput('') } }
  const clearKey = () => void setLlmConfig({ clearKey: true })
  const saveBaseUrl = () => { if (baseUrl !== llmConfig.baseUrl) void setLlmConfig({ baseUrl }) }
  const pickModel = (m: string) => void setLlmConfig({ model: m })

  const loadModels = async () => {
    setModelsError(null)
    const res = await refreshModels()
    if (!res.ok) setModelsError(res.error ?? t.aiPanel.provider.error)
  }

  const runTest = async () => {
    setTesting(true)
    setTestResult(null)
    setTestResult(await testConnection())
    setTesting(false)
  }

  // Visible only with an active 'ai' entitlement, or if NoteFlow AI is already the active
  // provider (lets a lapsed subscriber see the amber warning and switch away via the <select>).
  const showNoteflowCard = !!account?.entitlements.ai || llmConfig.active === 'noteflow'

  return (
    <div className={`flex flex-col gap-3 text-[13px] font-mono ${embedded ? '' : 'p-3 overflow-y-auto'}`}>
      {/* NoteFlow AI: the managed plan, called out separately from the BYO-key providers. */}
      {showNoteflowCard && (
        <div className="rounded-xl border-solid border border-accent/50 bg-accent/15 flex flex-col gap-2 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] font-bold text-text">NoteFlow AI</span>
              <span className="text-[11px] text-text-muted/70 normal-case">{t.aiPanel.provider.noteflowCard.subtitle}</span>
            </div>
            {llmConfig.active === 'noteflow' ? (
              <span className="flex items-center gap-1 text-[11px] font-bold text-accent shrink-0">
                <Check size={12} /> {t.aiPanel.provider.noteflowCard.active}
              </span>
            ) : (
              <button
                onClick={() => changeProvider('noteflow')}
                className="px-3 py-1.5 rounded-lg bg-text text-surface-0 text-[12px] font-bold shrink-0"
              >
                {t.aiPanel.provider.noteflowCard.useButton}
              </button>
            )}
          </div>
          {/* Monthly consumption (weighted quota tokens). Hidden while unknown or without entitlement. */}
          {account?.entitlements.ai && usage && usage.limit > 0 && (
            <div className="flex flex-col gap-1">
              <div className="h-1.5 rounded-full bg-border/50 overflow-hidden">
                <div
                  className={`h-full rounded-full ${usage.used >= usage.limit ? 'bg-amber-400' : 'bg-accent'}`}
                  style={{ width: `${Math.min(100, (usage.used / usage.limit) * 100)}%` }}
                />
              </div>
              <span className={`text-[11px] normal-case ${usage.used >= usage.limit ? 'text-amber-300' : 'text-text-muted/70'}`}>
                {tf(t.aiPanel.provider.noteflowCard.usage, { used: formatTokens(usage.used), limit: formatTokens(usage.limit) })}
              </span>
            </div>
          )}
          {llmConfig.active === 'noteflow' && account && (!account.signedIn || !account.entitlements.ai) && (
            <div className="px-2.5 py-2 rounded-lg border border-solid border-amber-500/30 bg-amber-500/10 text-[11px] text-amber-300 normal-case leading-relaxed">
              {!account.signedIn ? t.aiPanel.provider.noteflowSignIn : t.aiPanel.provider.noteflowNeedsSubscription}
            </div>
          )}
        </div>
      )}

      {/* Connection: provider + endpoint + key, grouped on one card. */}
      <Card className="flex flex-col gap-4 p-3.5">
        {/* Provider */}
        <div className="flex flex-col gap-1.5">
          <FieldLabel>{t.aiPanel.provider.provider}</FieldLabel>
          <select
            value={llmConfig.active}
            onChange={(e) => changeProvider(e.target.value)}
            className={FIELD_INPUT}
          >
            {selectablePresets.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          <span className="text-[11px] text-text-muted/60 normal-case">
            {preset.id === 'noteflow' ? t.aiPanel.provider.hintNoteflow : preset.impl === 'anthropic' ? t.aiPanel.provider.hintAnthropic : preset.needsKey ? t.aiPanel.provider.hintOpenAiCompat : t.aiPanel.provider.hintLocal}
          </span>
        </div>

        {/* Base URL */}
        {preset.editableBaseUrl && (
          <div className="flex flex-col gap-1.5">
            <FieldLabel>{t.aiPanel.provider.baseUrl}</FieldLabel>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              onBlur={saveBaseUrl}
              placeholder={preset.baseUrl || 'https://…/v1'}
              className={`${FIELD_INPUT} py-1.5`}
            />
          </div>
        )}

        {/* API key */}
        {preset.needsKey && (
          <div className="flex flex-col gap-1.5">
            <FieldLabel>{t.aiPanel.provider.apiKey}</FieldLabel>
            {llmConfig.hasKey ? (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-[12px] text-emerald-400"><Check size={12} /> {t.aiPanel.provider.keySaved}</span>
                <button onClick={clearKey} className="text-[11px] text-text-muted hover:text-red-300 flex items-center gap-1">
                  <X size={11} /> {t.aiPanel.remove}
                </button>
              </div>
            ) : (
              <div className="flex gap-1.5">
                <input
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="sk-…"
                  className={`flex-1 ${FIELD_INPUT} py-1.5`}
                />
                <button onClick={saveKey} disabled={!keyInput.trim()} className="px-3 py-1 rounded-lg bg-text text-surface-0 text-[12px] font-bold disabled:opacity-50">
                  {t.common.save}
                </button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Model + connection test. */}
      <Card className="flex flex-col gap-3 p-3.5">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <FieldLabel>{t.aiPanel.provider.model}</FieldLabel>
            <button onClick={loadModels} disabled={modelsLoading} className="text-[11px] text-text-muted hover:text-text flex items-center gap-1">
              {modelsLoading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} {t.aiPanel.provider.load}
            </button>
          </div>
          <input
            value={llmConfig.model}
            onChange={(e) => pickModel(e.target.value)}
            placeholder={preset.impl === 'anthropic' ? 'claude-opus-4-8' : 'model-name'}
            className={`${FIELD_INPUT} py-1.5`}
          />
          {modelsError && <span className="text-[11px] text-red-400">{modelsError}</span>}
          {modelOptions.length > 0 && (
            <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
              {modelOptions.map((m) => (
                <button
                  key={m}
                  onClick={() => pickModel(m)}
                  className={`px-1.5 py-0.5 rounded-md text-[11px] border-solid border transition-colors ${
                    m === llmConfig.model ? 'border-accent/50 bg-accent/15 text-text' : 'border-border text-text-muted hover:text-text hover:border-text/30'
                  }`}
                >
                  {modelLabel(m)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Test */}
        <div className="flex flex-col gap-1.5">
          <button
            onClick={runTest}
            disabled={testing}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border-solid border border-border text-text-muted hover:text-text hover:border-text/30 transition-colors disabled:opacity-50"
          >
            {testing ? <Loader2 size={12} className="animate-spin" /> : null}
            {t.aiPanel.provider.testConnection}
          </button>
          {testResult && (
            <span className={`text-[11px] ${testResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
              {testResult.ok ? t.aiPanel.provider.connected : `✗ ${testResult.error ?? t.aiPanel.provider.error}`}
            </span>
          )}
        </div>
      </Card>
    </div>
  )
}
