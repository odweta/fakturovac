const SIGNATURE_DATA_URL_PATTERN = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/;

const isValidSignatureDataUrl = (value) => typeof value === 'string'
    && SIGNATURE_DATA_URL_PATTERN.test(value);

const normalizeInvoiceData = (data) => {
    if (!data || !Array.isArray(data.items)) {
        return null;
    }

    const items = data.items.map((item) => ({
        popis: typeof item.popis === 'string' ? item.popis.trim() : '',
        mnozstvi: Number(item.mnozstvi),
        mernaJednotka: typeof item.mernaJednotka === 'string' ? item.mernaJednotka.trim() : '',
        cenaZaMj: Number(item.cenaZaMj)
    }));
    if (items.some((item) => !Number.isFinite(item.mnozstvi)
        || !Number.isFinite(item.cenaZaMj)
        || item.mnozstvi < 0
        || item.cenaZaMj < 0)) {
        return null;
    }

    const signature = isValidSignatureDataUrl(data.signature)
        ? data.signature
        : null;

    return {
        supplier: data.supplier || {},
        customer: data.customer || {},
        payment: data.payment || {},
        items,
        signature,
        total: items.reduce((sum, item) => sum + item.mnozstvi * item.cenaZaMj, 0)
    };
};

module.exports = { isValidSignatureDataUrl, normalizeInvoiceData };
