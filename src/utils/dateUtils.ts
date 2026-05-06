/**
 * Utilitários para manipulação de datas no RVM Designações
 */

export function toLocalISODate(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function getTodayWeekIdLocal(now: Date = new Date()): string {
    const localToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const day = localToday.getDay(); // 0=Dom, 1=Seg, …, 6=Sáb
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(localToday);
    monday.setDate(localToday.getDate() + diffToMonday);
    return toLocalISODate(monday);
}

export function isOnOrAfterToday(dateStr: string, now: Date = new Date()): boolean {
    if (!dateStr) return false;

    const parts = dateStr.split('-');
    if (parts.length !== 3) return false;

    const y = Number(parts[0]);
    const m = Number(parts[1]);
    const d = Number(parts[2]);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;

    const candidate = new Date(y, m - 1, d);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return candidate >= today;
}

export function formatWeekFromDate(dateStr: string): string {
    if (!dateStr) return '';

    try {
        const date = new Date(dateStr);
        // Validar data
        if (isNaN(date.getTime())) return dateStr;

        // Assumindo que a data importada do Excel é sempre o DOMINGO da semana
        // Calcular a SEGUNDA-FEIRA (início da semana)
        // Se date é Domingo (0), Segunda é date - 6
        // Se date é qualquer outro dia, ajustar para Segunda da mesma semana

        // Ajuste para encontrar a Segunda-feira da semana
        // Dia da semana: 0 (Dom) a 6 (Sab)
        const day = date.getDay();
        const diffToMonday = day === 0 ? -6 : 1 - day; // Se Dom(0) volta 6, Se Seg(1) volta 0, Se Ter(2) volta 1...

        const monday = new Date(date);
        monday.setDate(date.getDate() + diffToMonday);

        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);

        // Formatadores
        const dayfmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit' });
        const monthfmt = new Intl.DateTimeFormat('pt-BR', { month: 'long' });
        const yearfmt = new Intl.DateTimeFormat('pt-BR', { year: 'numeric' });

        const startDay = dayfmt.format(monday);
        const endDay = dayfmt.format(sunday);
        const month = monthfmt.format(sunday);
        const year = yearfmt.format(sunday);

        // Capitalizar mês
        const monthCap = month.charAt(0).toUpperCase() + month.slice(1);

        return `Semana de ${startDay}-${endDay} ${monthCap} ${year}`;
    } catch (e) {
        return dateStr;
    }
}
