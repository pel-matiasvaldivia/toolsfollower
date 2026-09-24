import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config.js';

/**
 * Canales de notificación (email vía SMTP, WhatsApp vía Cloud API de Meta) y
 * helpers puros de decisión/formato. El transporte se configura por variables
 * de entorno a nivel plataforma; los destinatarios son por tenant.
 */

const SEVERITY_RANK: Record<string, number> = { info: 0, warning: 1, critical: 2 };

/** ¿La severidad alcanza el umbral configurado por el tenant? */
export function shouldNotify(severity: string, minSeverity: string): boolean {
  return (SEVERITY_RANK[severity] ?? 1) >= (SEVERITY_RANK[minSeverity] ?? 1);
}

/** Asunto + texto de la notificación a partir de la alerta. */
export function formatAlert(a: { kind: string; severity: string; message: string; asset_name?: string | null }) {
  const who = a.asset_name ?? 'Activo';
  const subject = `Trazza — alerta: ${who}`;
  const text = `⚠ ${who}: ${a.message} (${a.kind} · ${a.severity})`;
  return { subject, text };
}

/** Separa una lista "a, b ,c" en ['a','b','c']. */
export function splitList(s: string | null | undefined): string[] {
  return (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);
}

export function emailEnabled(): boolean {
  return !!config.smtp.host;
}
export function whatsappEnabled(): boolean {
  return !!(config.whatsapp.token && config.whatsapp.phoneId);
}

let transporter: Transporter | null = null;
function getTransport(): Transporter | null {
  if (!config.smtp.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return transporter;
}

export async function sendEmail(to: string[], subject: string, text: string): Promise<void> {
  const t = getTransport();
  if (!t || to.length === 0) return;
  await t.sendMail({ from: config.smtp.from, to: to.join(','), subject, text });
}

export async function sendWhatsApp(to: string[], text: string): Promise<void> {
  if (!whatsappEnabled() || to.length === 0) return;
  for (const num of to) {
    const res = await fetch(`${config.whatsapp.apiBase}/${config.whatsapp.phoneId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.whatsapp.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: num,
        type: 'text',
        text: { body: text },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`WhatsApp ${res.status}: ${body.slice(0, 200)}`);
    }
  }
}
