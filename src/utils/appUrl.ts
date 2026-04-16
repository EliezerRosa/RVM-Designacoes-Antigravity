function ensureLeadingSlash(path: string): string {
    if (!path) return '/';
    return path.startsWith('/') ? path : `/${path}`;
}

function normalizeDirectoryPath(pathname: string): string {
    if (!pathname || pathname === '/') {
        return '/';
    }

    if (pathname.endsWith('/')) {
        return ensureLeadingSlash(pathname);
    }

    const lastSlashIndex = pathname.lastIndexOf('/');
    if (lastSlashIndex <= 0) {
        return '/';
    }

    return ensureLeadingSlash(pathname.slice(0, lastSlashIndex + 1));
}

export function getAppBasePath(): string {
    if (typeof window === 'undefined') {
        return ensureLeadingSlash(import.meta.env.BASE_URL || '/');
    }

    return normalizeDirectoryPath(window.location.pathname);
}

export function getAppBaseUrl(): string {
    if (typeof window === 'undefined') {
        return ensureLeadingSlash(import.meta.env.BASE_URL || '/').replace(/\/$/, '');
    }

    return new URL(getAppBasePath(), window.location.origin).toString().replace(/\/$/, '');
}

export function resolveAppUrl(relativePath = ''): string {
    const cleanPath = relativePath.replace(/^\/+/, '');
    return new URL(cleanPath, `${getAppBaseUrl()}/`).toString();
}
