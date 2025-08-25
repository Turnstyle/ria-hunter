// app/config/credits.ts
// CENTRALIZED CREDITS CONFIGURATION

export const CREDITS_CONFIG = {
  // Anonymous user limits
  ANONYMOUS_FREE_CREDITS: 15,
  ANONYMOUS_SHARE_BONUS_MAX: 1,
  
  // Authenticated free user limits  
  FREE_USER_MONTHLY_CREDITS: 15,
  FREE_USER_SHARE_BONUS_MAX: 1,
  
  // Cookie settings
  ANONYMOUS_COOKIE_NAME: 'anon_queries',
  ANONYMOUS_COOKIE_MAX_AGE: 30 * 24 * 60 * 60, // 30 days
  
  // Response messages
  MESSAGES: {
    CREDITS_EXHAUSTED_ANONYMOUS: 'You have used all 15 free searches. Create an account to continue.',
    CREDITS_EXHAUSTED_FREE: 'You have reached your monthly limit. Upgrade to continue.',
    CREDITS_REMAINING: (count: number) => `${count} searches remaining`
  }
} as const;

export type CreditsConfig = typeof CREDITS_CONFIG;
