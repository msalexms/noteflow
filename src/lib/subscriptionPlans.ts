// Subscription plan prices shown in the UI (Settings → Account / Cloud panel).
//
// DISPLAY-ONLY: the authoritative figure is always the one shown at the Lemon
// Squeezy checkout — these strings exist so the app can advertise the price
// before opening the browser. Keep them in sync with the LS product variants
// (and with the /pricing page of the website).

export type SubscriptionProduct = 'ai' | 'cloud' | 'bundle'

export const SUBSCRIPTION_PRICES: Record<SubscriptionProduct, { monthly: string; yearly: string }> = {
  ai: { monthly: '€5.99', yearly: '€49.99' },
  cloud: { monthly: '€3.99', yearly: '€39.99' },
  bundle: { monthly: '€7.99', yearly: '€79.99' },
}
