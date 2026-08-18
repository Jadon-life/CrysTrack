export const EXPERIENCE_CONFIG = {
  brand: {
    name: 'CrysTrack',
    wealthLabel: 'Wealth',
  },
  dashboard: {
    quote: 'Discipline today, freedom tomorrow.',
    maxWidth: 1560,
  },
  scenes: {
    morning: 'Sunrise Bettmerhorn snowy mountains (Unsplash).jpg',
    day: 'Mountain Landscape (Unsplash).jpg',
    golden: 'Golden city skyline (Unsplash).jpg',
    evening: 'Sunset Vibes (Unsplash).jpg',
    // CC0 Wikimedia Commons image. Changing this one line swaps the night scene.
    night: 'Pudong skyline at night from Huangpu River 20260417 (4).jpg',
  },
  wealth: {
    canonicalCurrency: 'NGN' as const,
    alternateCurrency: 'USD' as const,
    categories: [
      'Food',
      'Transport',
      'Housing',
      'Utilities',
      'Health',
      'Family',
      'Education',
      'Business',
      'Shopping',
      'Entertainment',
      'Giving',
      'Debt',
      'Subscriptions',
      'Savings',
      'Other',
    ],
    exchangeRate: {
      provider: 'ExchangeRate-API',
      openEndpoint: 'https://open.er-api.com/v6/latest/USD',
      attribution: 'Rates by ExchangeRate-API',
    },
  },
} as const;

export type WealthDisplayCurrency =
  | typeof EXPERIENCE_CONFIG.wealth.canonicalCurrency
  | typeof EXPERIENCE_CONFIG.wealth.alternateCurrency;
