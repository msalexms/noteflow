import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Loader2, RefreshCw, X } from 'lucide-react'
import { useAiChatStore } from '../../stores/aiChatStore'
import { Card, FieldLabel, FIELD_INPUT } from './ui'

export function LlmConfigView({ embedded = false }: { embedded?: boolean } = {}) {
  const llmConfig = useAiChatStore((s) => s.llmConfig)
  const presets = useAiChatStore((s) => s.presets)
  const setLlmConfig = useAiChatStore((s) => s.setLlmConfig)
  const refreshModels = useAiChatStore((s) => s.refreshModels)
  const models = useAiChatStore((s) => s.models)
  const modelsLoading = useAiChatStore((s) => s.modelsLoading)
  const testConnection = useAiChatStore((s) => s.testConnection)

  const preset = useMemo(() => presets.find((p) => p.id === llmConfig?.active) ?? null, [presets, llmConfig?.active])
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
  const lastActive = useRef<string | null>(null)

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
  const saveKey = async () => { if (keyInput.trim()) { await setLlmConfig({ apiKey: keyInput.trim() }); setKeyInput('') } }
  const clearKey = () => void setLlmConfig({ clearKey: true })
  const saveBaseUrl = () => { if (baseUrl !== llmConfig.baseUrl) void setLlmConfig({ baseUrl }) }
  const pickModel = (m: string) => void setLlmConfig({ model: m })

  const loadModels = async () => {
    setModelsError(null)
    const res = await refreshModels()
    if (!res.ok) setModelsError(res.error ?? 'Error')
  }

  const runTest = async () => {
    setTesting(true)
    setTestResult(null)
    setTestResult(await testConnection())
    setTesting(false)
  }

  return (
    <div className={`flex flex-col gap-3 text-[13px] font-mono ${embedded ? '' : 'p-3 overflow-y-auto'}`}>
      {/* Connection: provider + endpoint + key, grouped on one card. */}
      <Card className="flex flex-col gap-4 p-3.5">
        {/* Provider */}
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Provider</FieldLabel>
          <select
            value={llmConfig.active}
            onChange={(e) => changeProvider(e.target.value)}
            className={FIELD_INPUT}
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          <span className="text-[11px] text-text-muted/60 normal-case">
            {preset.impl === 'anthropic' ? 'Claude via the official API (BYO key).' : preset.needsKey ? 'OpenAI-compatible endpoint (BYO key).' : 'Local / no API key required.'}
          </span>
        </div>

        {/* Base URL */}
        {preset.editableBaseUrl && (
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Base URL</FieldLabel>
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
            <FieldLabel>API key</FieldLabel>
            {llmConfig.hasKey ? (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-[12px] text-emerald-400"><Check size={12} /> Key saved</span>
                <button onClick={clearKey} className="text-[11px] text-text-muted hover:text-red-300 flex items-center gap-1">
                  <X size={11} /> Remove
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
                  Save
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
            <FieldLabel>Model</FieldLabel>
            <button onClick={loadModels} disabled={modelsLoading} className="text-[11px] text-text-muted hover:text-text flex items-center gap-1">
              {modelsLoading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} Load
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
                  {m}
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
            Test connection
          </button>
          {testResult && (
            <span className={`text-[11px] ${testResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
              {testResult.ok ? '✓ Connected' : `✗ ${testResult.error ?? 'Error'}`}
            </span>
          )}
        </div>
      </Card>
    </div>
  )
}
