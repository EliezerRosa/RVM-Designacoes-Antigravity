const DEFAULT_AI_PROXY_ORIGIN = 'https://rvm-designacoes-antigravity.vercel.app';

function trimTrailingSlash(value: string): string {
    return value.replace(/\/+$/, '');
}

function getConfiguredProxyOrigin(): string {
    const configuredOrigin = import.meta.env.VITE_AI_PROXY_ORIGIN;

    if (typeof configuredOrigin === 'string' && configuredOrigin.trim()) {
        return trimTrailingSlash(configuredOrigin.trim());
    }

    return DEFAULT_AI_PROXY_ORIGIN;
}

export function getAiProxyUrl(): string {
    if (typeof window === 'undefined') {
        return '/api/chat';
    }

    const { hostname, origin } = window.location;
    const normalizedHost = hostname.toLowerCase();
    const sameOriginCapable = normalizedHost.endsWith('.vercel.app')
        || (!normalizedHost.endsWith('github.io')
            && normalizedHost !== 'localhost'
            && normalizedHost !== '127.0.0.1');

    if (sameOriginCapable) {
        return `${trimTrailingSlash(origin)}/api/chat`;
    }

    return `${getConfiguredProxyOrigin()}/api/chat`;
}