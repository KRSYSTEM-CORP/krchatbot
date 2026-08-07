interface Env {
  APP_URL: string;
  CRON_SECRET: string;
}

export default {
  async fetch() {
    return new Response("krchatbot-cron: ok, esperando el próximo disparo programado");
  },

  async scheduled(_event: ScheduledController, env: Env) {
    const response = await fetch(`${env.APP_URL}/api/cron`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.CRON_SECRET}` },
    });
    if (!response.ok) {
      console.error("Cron falló:", response.status, await response.text());
    }
  },
} satisfies ExportedHandler<Env>;
