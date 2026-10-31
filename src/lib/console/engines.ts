/* ------------------------------------------------------------------ */
/* CONSOLE ENGINE STATUS — presence checks for the AI provider pool    */
/*                                                                     */
/* Reports which premium engines have keys provisioned in this         */
/* deployment (values are NEVER exposed — booleans only). Keeps the    */
/* console decoupled from each provider lib's internals.               */
/* ------------------------------------------------------------------ */

export function hfConfigured(): boolean {
  return Boolean(process.env.HF_TOKEN)
}

export function xaiConfigured(): boolean {
  return Boolean(process.env.XAI_API_KEY)
}

export function groqConfiguredIfAvailable(): boolean {
  return Boolean(process.env.GROQ_API_KEY)
}

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY)
}

export function openrouterConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY)
}

/** Full presence map for the integrations view. */
export function enginePresence(): Record<string, boolean> {
  return {
    gemini: geminiConfigured(),
    groq: groqConfiguredIfAvailable(),
    xai: xaiConfigured(),
    huggingface: hfConfigured(),
    openrouter: openrouterConfigured(),
    agnes: Boolean(process.env.AGNES_API_KEY),
    vercelGateway: Boolean(process.env.AI_GATEWAY_API_KEY),
    supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    emailSecret: Boolean(process.env.NEXUS_EMAIL_SECRET),
    authSecret: Boolean(process.env.AUTH_SECRET),
    consoleGate: Boolean(process.env.CONSOLE_PASSWORD),
    vercelApi: Boolean(process.env.VERCEL_TOKEN),
    githubApi: Boolean(process.env.GITHUB_TOKEN),
    zai: false,
  }
}
