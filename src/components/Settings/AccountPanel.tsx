import { useEffect, useState } from 'react'
import { KeyRound, Loader, LogOut, Mail, RefreshCw, Sparkles, UserCircle } from 'lucide-react'
import type { AccountStatus } from '../../types'
import { SUBSCRIPTION_PRICES, type SubscriptionProduct } from '../../lib/subscriptionPlans'
import { tf } from '../../i18n/format'
import { useT } from '../../i18n/useT'
import { useLanguageStore } from '../../stores/languageStore'
import { settingsButtonClass } from './ui'

// Public legal pages on the website; Spanish UI links to the /es mirrors.
const LEGAL_BASE = 'https://yagoid.github.io/noteflow'

type Step = 'email' | 'code'

// Settings → Account: NoteFlow account (Supabase email + OTP) and plan badges.
// All session/token handling lives in the main process — this panel only ever
// sees the public AccountStatus.
export function AccountPanel() {
  const t = useT()
  const lang = useLanguageStore((s) => s.lang)
  const legalUrl = (page: 'terms' | 'privacy') =>
    `${LEGAL_BASE}${lang === 'es' ? '/es' : ''}/${page}`
  const [status, setStatus] = useState<AccountStatus | null>(null)
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.noteflow.getAccountStatus().then(setStatus)
    return window.noteflow.onAccountStatusChanged(setStatus)
  }, [])

  async function handleSendCode() {
    const trimmed = email.trim()
    if (!trimmed) return
    setBusy(true)
    setError(null)
    const result = await window.noteflow.accountRequestOtp(trimmed)
    setBusy(false)
    if (result.ok) {
      setStep('code')
      setCode('')
    } else {
      setError(result.error ?? t.settings.account.couldNotSendCode)
    }
  }

  async function handleVerify() {
    const trimmed = code.trim()
    if (!trimmed) return
    setBusy(true)
    setError(null)
    const result = await window.noteflow.accountVerifyOtp(email.trim(), trimmed)
    setBusy(false)
    if (result.ok) {
      // Status arrives via onAccountStatusChanged; reset the form for next time.
      setStep('email')
      setCode('')
      setEmail('')
    } else {
      setError(result.error ?? t.settings.account.couldNotVerify)
    }
  }

  function handleUseDifferentEmail() {
    setStep('email')
    setCode('')
    setError(null)
  }

  async function handleRefresh() {
    setBusy(true)
    setError(null)
    const result = await window.noteflow.accountRefreshEntitlements()
    setBusy(false)
    if (!result.ok) setError(result.error ?? t.settings.account.couldNotRefresh)
  }

  async function handleSubscribe(product: SubscriptionProduct) {
    setError(null)
    const result = await window.noteflow.accountOpenCheckout(product)
    if (!result.ok) setError(result.error ?? t.settings.account.couldNotOpenCheckout)
  }

  async function handleSignOut() {
    setBusy(true)
    setError(null)
    await window.noteflow.accountSignOut()
    setBusy(false)
    setStep('email')
    setEmail('')
    setCode('')
  }

  // ── Initial status fetch ──
  if (!status) {
    return (
      <div className="flex items-center gap-2 text-text-muted">
        <Loader size={12} className="animate-spin" />
        <span className="text-xs font-mono">{t.common.loading}</span>
      </div>
    )
  }

  // ── Not configured (no Supabase project in this build) ──
  if (!status.configured) {
    return (
      <p className="text-[11px] font-mono text-text-muted leading-relaxed">
        {t.settings.account.notAvailable}
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {/* Error */}
      {error && (
        <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-xs font-mono text-red-400">
          {error}
        </div>
      )}

      {/* ── Signed in ── */}
      {status.signedIn && (
        <>
          <div className="flex items-center gap-2">
            <UserCircle size={13} className="text-green-400" />
            <span className="text-xs font-mono text-text">{status.email}</span>
          </div>

          <div className="space-y-2">
            <PlanBadge name="NoteFlow AI" active={status.entitlements.ai} />
            <PlanBadge name="NoteFlow Cloud" active={status.entitlements.cloud} />
          </div>

          {status.entitlementsFetchedAt && (
            <p className="text-[11px] font-mono text-text-muted/60">
              {tf(t.settings.account.lastChecked, { time: new Date(status.entitlementsFetchedAt).toLocaleString() })}
            </p>
          )}

          {/* Subscription plans — each plan shows only while its entitlement is
              missing (Bundle needs both missing, to avoid double billing). A
              plan without a checkout URL in this build shows "Coming soon". */}
          <PlansSection status={status} busy={busy} onSubscribe={handleSubscribe} />

          <div className="flex gap-2">
            <button
              onClick={handleRefresh}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono bg-surface-2 hover:bg-surface-3 text-text transition-colors disabled:opacity-40"
            >
              {busy ? <Loader size={11} className="animate-spin" /> : <RefreshCw size={11} />}
              {t.settings.account.refresh}
            </button>
            <button
              onClick={handleSignOut}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
            >
              <LogOut size={11} />
              {t.settings.account.signOut}
            </button>
          </div>
        </>
      )}

      {/* ── Signed out: step 1 — email ── */}
      {!status.signedIn && step === 'email' && (
        <div className="space-y-3 pt-1">
          <p className="text-[11px] font-mono text-text-muted leading-relaxed">
            {t.settings.account.signInDesc}
          </p>
          <div>
            <label className="block text-[11px] font-mono text-text-muted mb-1 uppercase tracking-wider">
              {t.settings.account.email}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSendCode() }}
              placeholder="you@example.com"
              disabled={busy}
              className="w-full px-3 py-1.5 rounded text-xs font-mono bg-surface-0 border border-border text-text placeholder:text-text-muted/40 focus:outline-none focus:border-text/30 disabled:opacity-40"
            />
          </div>
          <button
            onClick={handleSendCode}
            disabled={busy || !email.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono bg-surface-2 hover:bg-surface-3 text-text border border-text/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? <Loader size={11} className="animate-spin" /> : <Mail size={11} />}
            {t.settings.account.sendCode}
          </button>
          {/* Legal acceptance line — links open in the default browser via the
              existing openUrl bridge (shell.openExternal in main). */}
          <p className="text-[10px] font-mono text-text-muted/60 leading-relaxed">
            {t.settings.account.legalPrefix}
            <button
              onClick={() => window.noteflow.openUrl(legalUrl('terms'))}
              className="underline underline-offset-2 hover:text-text transition-colors"
            >
              {t.settings.account.legalTerms}
            </button>
            {t.settings.account.legalMiddle}
            <button
              onClick={() => window.noteflow.openUrl(legalUrl('privacy'))}
              className="underline underline-offset-2 hover:text-text transition-colors"
            >
              {t.settings.account.legalPrivacy}
            </button>
            {t.settings.account.legalSuffix}
          </p>
        </div>
      )}

      {/* ── Signed out: step 2 — verification code ── */}
      {!status.signedIn && step === 'code' && (
        <div className="space-y-3 pt-1">
          <p className="text-[11px] font-mono text-text-muted leading-relaxed">
            {t.settings.account.codeSentPrefix}
            <span className="text-text">{email.trim()}</span>
            {t.settings.account.codeSentSuffix}
          </p>
          <div>
            <label className="block text-[11px] font-mono text-text-muted mb-1 uppercase tracking-wider">
              {t.settings.account.code}
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleVerify() }}
              placeholder="123456"
              disabled={busy}
              className="w-full px-3 py-1.5 rounded text-xs font-mono tracking-widest bg-surface-0 border border-border text-text placeholder:text-text-muted/40 focus:outline-none focus:border-text/30 disabled:opacity-40"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleVerify}
              disabled={busy || !code.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono bg-surface-2 hover:bg-surface-3 text-text border border-text/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? <Loader size={11} className="animate-spin" /> : <KeyRound size={11} />}
              {t.settings.account.verifyAndSignIn}
            </button>
            <button
              onClick={handleUseDifferentEmail}
              disabled={busy}
              className={`px-3 py-1.5 rounded text-xs font-mono ${settingsButtonClass}`}
            >
              {t.settings.account.useDifferentEmail}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Plans the signed-in user can still subscribe to. Bundle only shows while
// BOTH entitlements are missing (a bundle on top of a single plan would mean
// paying twice for the same product); if every plan is covered, nothing renders.
function PlansSection({
  status,
  busy,
  onSubscribe,
}: {
  status: AccountStatus
  busy: boolean
  onSubscribe: (product: SubscriptionProduct) => void
}) {
  const t = useT()
  const { ai, cloud } = status.entitlements
  const plans: Array<{ product: SubscriptionProduct; name: string; subtitle?: string; visible: boolean; configured: boolean }> = [
    { product: 'bundle', name: 'NoteFlow Bundle', subtitle: t.settings.account.planBundleSubtitle, visible: !ai && !cloud, configured: status.bundleCheckoutConfigured },
    { product: 'ai', name: 'NoteFlow AI', visible: !ai, configured: status.aiCheckoutConfigured },
    { product: 'cloud', name: 'NoteFlow Cloud', visible: !cloud, configured: status.cloudCheckoutConfigured },
  ]
  const visible = plans.filter((p) => p.visible)
  if (visible.length === 0) return null

  return (
    <div className="space-y-2">
      {visible.map((plan) => (
        <div key={plan.product} className="px-3 py-2 rounded bg-surface-0 border border-border">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-xs font-mono text-text">{plan.name}</span>
              {plan.subtitle && (
                <span className="ml-2 text-[11px] font-mono text-text-muted/60">{plan.subtitle}</span>
              )}
              <p className="text-[11px] font-mono text-text-muted mt-0.5">
                {tf(t.settings.account.planPrice, {
                  monthly: SUBSCRIPTION_PRICES[plan.product].monthly,
                  yearly: SUBSCRIPTION_PRICES[plan.product].yearly,
                })}
              </p>
            </div>
            {plan.configured ? (
              <button
                onClick={() => onSubscribe(plan.product)}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono bg-surface-2 hover:bg-surface-3 text-text border border-text/20 transition-colors disabled:opacity-40 shrink-0"
              >
                <Sparkles size={11} />
                {t.settings.account.subscribe}
              </button>
            ) : (
              <span className="text-[11px] font-mono text-text-muted/60 shrink-0">
                {t.settings.account.comingSoon}
              </span>
            )}
          </div>
        </div>
      ))}
      <p className="text-[11px] font-mono text-text-muted/60 leading-relaxed">
        {t.settings.account.subscribeHint}
      </p>
    </div>
  )
}

function PlanBadge({ name, active }: { name: string; active: boolean }) {
  const t = useT()
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded bg-surface-0 border border-border">
      <span className="text-xs font-mono text-text">{name}</span>
      {active ? (
        <span className="text-[11px] font-mono text-green-400 bg-green-500/10 border border-green-500/30 rounded px-2 py-0.5">
          {t.settings.account.active}
        </span>
      ) : (
        <span className="text-[11px] font-mono text-text-muted/60">—</span>
      )}
    </div>
  )
}
