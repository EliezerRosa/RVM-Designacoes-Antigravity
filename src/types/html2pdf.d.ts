declare module 'html2pdf.js' {
    interface Html2PdfOptions {
        margin?: number | number[];
        filename?: string;
        image?: { type: string; quality: number };
        html2canvas?: { scale: number; useCORS?: boolean };
        jsPDF?: { unit: string; format: string; orientation: 'portrait' | 'landscape' };
        pagebreak?: { mode?: string | string[]; before?: string | string[]; after?: string | string[]; avoid?: string | string[] };
    }

    interface Html2Pdf {
        set(options: Html2PdfOptions): Html2Pdf;
        from(element: Element | null): Html2Pdf;
        save(): Promise<void>;
        toPdf(): Html2Pdf;
        get(type: string): Promise<unknown>;
        output(type: string, options?: unknown): Promise<unknown>;
    }

    function html2pdf(): Html2Pdf;
    export = html2pdf;
}
