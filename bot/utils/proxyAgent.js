import { ProxyAgent } from 'undici';

export const agent = new ProxyAgent(process.env.PROXY_URL);

export const proxyUrl =
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy;

export const proxyAgent = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

export function withProxy(options = {}) {
  if (!proxyAgent) return options;
  return { ...options, dispatcher: proxyAgent };
}
